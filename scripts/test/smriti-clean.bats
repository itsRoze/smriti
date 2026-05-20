#!/usr/bin/env bats
# Tests for bin/smriti-clean — post-merge tidy.
# Run via: bun run test (which shells out to scripts/run-tests.sh).
#
# Test isolation: every test gets its own mktemp dir + git init. The script is
# invoked through a PATH-symlink (FAKE_BIN) so we exercise the production shape,
# not the in-repo absolute path — same lesson as ELI-37.
#
# gh is mocked via a PATH-shim that produces canned JSON, so the gh-detection
# path is exercised even in environments without GitHub auth.

setup() {
  ROOT="$BATS_TEST_DIRNAME/../.."
  WORK=$(mktemp -d)
  # FAKE_BIN must live OUTSIDE the test git repo, otherwise it shows up as
  # an untracked dir in `git status --porcelain` and every test trips the
  # dirty-tree precondition. Put it in a sibling dir; cd into REPO.
  FAKE_BIN="$WORK/fake-bin"
  REPO="$WORK/repo"
  mkdir -p "$FAKE_BIN" "$REPO"
  cd "$REPO"

  ln -s "$ROOT/bin/smriti-clean" "$FAKE_BIN/smriti-clean"
  ln -s "$ROOT/bin/smriti-default-branch" "$FAKE_BIN/smriti-default-branch"
  CLI="$FAKE_BIN/smriti-clean"

  # Default: run with NO gh on PATH so tests use the git-fallback path. We
  # prepend FAKE_BIN; the mock_gh helper drops a `gh` shim there when a test
  # wants to exercise the gh path. Real PATH is otherwise preserved so jq,
  # git, etc. still resolve. We restore PATH in teardown.
  #
  # Belt-and-suspenders: if the host has a real `gh` ahead of FAKE_BIN in PATH,
  # tests would see the developer's GitHub state instead of git-fallback. The
  # explicit gh shim in mock_gh covers the positive path; for the negative
  # path we set GH_TOKEN= to nothing AND drop a failing shim in FAKE_BIN.
  ORIG_PATH="$PATH"
  PATH="$FAKE_BIN:$PATH"
}

teardown() {
  PATH="$ORIG_PATH"
  cd /
  rm -rf "$WORK"
}

# Helpers ---------------------------------------------------------------

init_repo() {
  git init -q -b main
  git config user.email "test@smriti.local"
  git config user.name "smriti-test"
  echo seed > f
  git add f
  git commit -q -m "initial"
  # Default: pre-install a failing `gh` shim so the script takes the git-fallback
  # path regardless of whether real `gh` is on the host's PATH. Tests that need
  # the gh path overwrite this via mock_gh.
  cat > "$FAKE_BIN/gh" <<'EOF'
#!/usr/bin/env bash
exit 1
EOF
  chmod +x "$FAKE_BIN/gh"
}

# Make a merged feature branch: branch off main, commit, merge back with
# --no-ff so the branch tip is reachable from main (git-fallback can detect it).
make_merged_branch() {
  local name="$1"
  git checkout -q -b "$name"
  echo "change-$name" > "f-$name"
  git add "f-$name"
  git commit -q -m "$name: work"
  git checkout -q main
  git merge --no-ff --no-edit -q "$name"
  git checkout -q "$name"
}

# Install a `gh` mock in FAKE_BIN that returns a canned JSON payload for
# `gh pr list ...` and a successful `gh auth status`. Caller passes the JSON.
mock_gh() {
  local payload="$1"
  cat > "$FAKE_BIN/gh" <<EOF
#!/usr/bin/env bash
case "\$1" in
  auth) exit 0 ;;
  pr)   printf '%s' '$payload'; exit 0 ;;
esac
exit 1
EOF
  chmod +x "$FAKE_BIN/gh"
}

# ─── --plan: global preconditions ──────────────────────────────────────

@test "plan: dirty tree -> action=refuse with reason" {
  init_repo
  echo dirty > f  # uncommitted change
  run "$CLI" --plan
  [ "$status" -eq 0 ]
  [ "$(echo "$output" | jq -r .action)" = "refuse" ]
  echo "$output" | jq -r .refusal_reason | grep -q "dirty"
}

@test "plan: detached HEAD -> action=refuse" {
  init_repo
  git checkout -q --detach HEAD
  run "$CLI" --plan
  [ "$status" -eq 0 ]
  [ "$(echo "$output" | jq -r .action)" = "refuse" ]
  echo "$output" | jq -r .refusal_reason | grep -qi "detached"
}

@test "plan: unborn repo -> action=refuse" {
  git init -q -b main
  git config user.email "test@smriti.local"
  git config user.name "smriti-test"
  # No init_repo here (we don't want a commit) — install the gh shim manually
  # so the script doesn't try the real gh during fallback detection.
  cat > "$FAKE_BIN/gh" <<'EOF'
#!/usr/bin/env bash
exit 1
EOF
  chmod +x "$FAKE_BIN/gh"
  run "$CLI" --plan
  [ "$status" -eq 0 ]
  [ "$(echo "$output" | jq -r .action)" = "refuse" ]
  echo "$output" | jq -r .refusal_reason | grep -qi "unborn"
}

# ─── --plan: action dispatch ───────────────────────────────────────────

@test "plan: on default branch with merged candidates -> action=batch" {
  init_repo
  make_merged_branch "feat-a"
  make_merged_branch "feat-b"
  git checkout -q main
  run "$CLI" --plan
  [ "$status" -eq 0 ]
  [ "$(echo "$output" | jq -r .action)" = "batch" ]
  [ "$(echo "$output" | jq -r '.candidates | length')" = "2" ]
  [ "$(echo "$output" | jq -r .detection)" = "git-fallback" ]
}

@test "plan: on default branch with nothing merged -> action=noop" {
  init_repo
  run "$CLI" --plan
  [ "$status" -eq 0 ]
  [ "$(echo "$output" | jq -r .action)" = "noop" ]
}

@test "plan: on merged feature branch -> action=single with that branch" {
  init_repo
  make_merged_branch "feat-a"
  # make_merged_branch leaves us on feat-a
  run "$CLI" --plan
  [ "$status" -eq 0 ]
  [ "$(echo "$output" | jq -r .action)" = "single" ]
  [ "$(echo "$output" | jq -r '.candidates[0].branch')" = "feat-a" ]
  [ "$(echo "$output" | jq -r '.current_branch')" = "feat-a" ]
}

@test "plan: on feature branch not in merged list -> action=noop" {
  init_repo
  git checkout -q -b stray-work
  echo wip > w
  git add w
  git commit -q -m "wip"
  run "$CLI" --plan
  [ "$status" -eq 0 ]
  [ "$(echo "$output" | jq -r .action)" = "noop" ]
  echo "$output" | jq -r .refusal_reason | grep -q "stray-work"
}

# ─── --plan: detection mode ────────────────────────────────────────────

@test "plan: with mocked gh -> detection=gh" {
  init_repo
  make_merged_branch "feat-a"
  git checkout -q main
  mock_gh '[{"number":42,"headRefName":"feat-a"}]'
  run "$CLI" --plan
  [ "$status" -eq 0 ]
  [ "$(echo "$output" | jq -r .detection)" = "gh" ]
  [ "$(echo "$output" | jq -r '.candidates[0].merged_pr')" = "42" ]
}

@test "plan: gh auth fails -> detection=git-fallback" {
  init_repo
  make_merged_branch "feat-a"
  git checkout -q main
  cat > "$FAKE_BIN/gh" <<'EOF'
#!/usr/bin/env bash
exit 1
EOF
  chmod +x "$FAKE_BIN/gh"
  run "$CLI" --plan
  [ "$status" -eq 0 ]
  [ "$(echo "$output" | jq -r .detection)" = "git-fallback" ]
}

# ─── --plan: candidate safety ──────────────────────────────────────────

@test "plan: candidate with unpushed commits ahead of upstream -> safe_to_delete=false" {
  init_repo
  git init -q --bare "$WORK/remote.git"
  git remote add origin "$WORK/remote.git"
  git push -q -u origin main

  make_merged_branch "feat-a"
  git push -q -u origin feat-a
  git checkout -q feat-a
  echo extra > e && git add e && git commit -q -m "extra unpushed"
  git checkout -q main

  # gh mock: report feat-a as merged (mirrors a squash-merged PR where the
  # local branch has post-merge commits — exactly the case we want to catch).
  # git-fallback can't see this scenario by design (branch isn't reachable
  # from main once it has post-merge commits), so the gh path is the relevant
  # one here.
  mock_gh '[{"number":7,"headRefName":"feat-a"}]'

  run "$CLI" --plan
  [ "$status" -eq 0 ]
  [ "$(echo "$output" | jq -r '.candidates[0].safe_to_delete')" = "false" ]
  echo "$output" | jq -r '.candidates[0].refusal_reason' | grep -qi "ahead"
}

@test "plan: candidate with no upstream -> safe_to_delete=false" {
  init_repo
  make_merged_branch "feat-a"
  # feat-a never pushed → no upstream
  git checkout -q main
  run "$CLI" --plan
  [ "$status" -eq 0 ]
  [ "$(echo "$output" | jq -r '.candidates[0].safe_to_delete')" = "false" ]
  echo "$output" | jq -r '.candidates[0].refusal_reason' | grep -qi "upstream"
}

# ─── --list-merged ─────────────────────────────────────────────────────

@test "list-merged: emits one JSONL row per candidate, minimal schema" {
  init_repo
  make_merged_branch "feat-a"
  make_merged_branch "feat-b"
  git checkout -q main
  run "$CLI" --list-merged
  [ "$status" -eq 0 ]
  [ "$(echo "$output" | wc -l | tr -d ' ')" = "2" ]
  # Each row has exactly the three Q2-locked fields, no more.
  echo "$output" | jq -e '.branch and (.merged_pr == null or .merged_pr) and (.safe_to_delete == true or .safe_to_delete == false)' >/dev/null
  echo "$output" | jq -e '. | keys == ["branch","merged_pr","safe_to_delete"]' >/dev/null
}

# ─── --branch <name> ───────────────────────────────────────────────────

@test "branch: happy path deletes merged branch, switches to default, prunes" {
  init_repo
  # Need a remote so feat-a has an upstream (otherwise no-upstream soft refuses).
  git init -q --bare "$WORK/remote.git"
  git remote add origin "$WORK/remote.git"
  git push -q -u origin main

  make_merged_branch "feat-a"
  git push -q -u origin feat-a
  # We're on feat-a → script should checkout main, delete feat-a
  run "$CLI" --branch feat-a
  [ "$status" -eq 0 ]
  [ "$(git symbolic-ref --short HEAD)" = "main" ]
  ! git show-ref --verify --quiet refs/heads/feat-a
}

@test "branch: squash-merge production happy path (gh says merged, local tip == upstream tip)" {
  # Production-shape regression: simulate a squash-merged PR. feat-a's tip is
  # NOT reachable from main locally (squash creates a brand-new commit on
  # main with different SHA), but feat-a's tip == origin/feat-a's tip because
  # we pushed everything before the squash. `git branch -d` must succeed via
  # the "merged into upstream" rule, not the "merged into HEAD" rule that the
  # no-ff test above exercises. A future refactor of delete_branch that
  # silently requires HEAD-reachability would break the production path while
  # leaving the no-ff test green; this case locks the upstream-tip path.
  init_repo
  git init -q --bare "$WORK/remote.git"
  git remote add origin "$WORK/remote.git"
  git push -q -u origin main

  # Build feat-a + push it, but don't merge locally — the squash happened on
  # GitHub, not in this clone, so main here is unchanged.
  git checkout -q -b feat-a
  echo work > f-a && git add f-a && git commit -q -m "feat-a work"
  git push -q -u origin feat-a
  git checkout -q main

  # gh reports the PR as merged. This is the only signal we have that the
  # squash happened — git's view of main is still empty of feat-a's work.
  mock_gh '[{"number":11,"headRefName":"feat-a"}]'

  run "$CLI" --branch feat-a
  [ "$status" -eq 0 ]
  ! git show-ref --verify --quiet refs/heads/feat-a
}

@test "branch: refuses to delete the default branch (exit 3)" {
  init_repo
  run "$CLI" --branch main
  [ "$status" -eq 3 ]
  echo "$output" | grep -qi "denylisted"
}

@test "branch: refuses to delete a custom --default-branch (exit 3)" {
  init_repo
  git checkout -q -b trunk
  run "$CLI" --branch trunk --default-branch trunk
  [ "$status" -eq 3 ]
}

@test "branch: dirty tree blocks (exit 2)" {
  init_repo
  make_merged_branch "feat-a"
  git checkout -q main
  echo dirty > scratch
  git add scratch
  run "$CLI" --branch feat-a
  [ "$status" -eq 2 ]
}

@test "branch: detached HEAD blocks (exit 6)" {
  init_repo
  make_merged_branch "feat-a"
  git checkout -q main
  git checkout -q --detach HEAD
  run "$CLI" --branch feat-a
  [ "$status" -eq 6 ]
}

@test "branch: not merged into default -> exit 4 without --force" {
  init_repo
  git checkout -q -b stray-work
  echo work > w
  git add w
  git commit -q -m wip
  git checkout -q main
  run "$CLI" --branch stray-work
  [ "$status" -eq 4 ]
}

@test "branch: --force overrides unmerged refusal" {
  init_repo
  git checkout -q -b stray-work
  echo work > w
  git add w
  git commit -q -m wip
  git checkout -q main
  run "$CLI" --branch stray-work --force
  [ "$status" -eq 0 ]
  ! git show-ref --verify --quiet refs/heads/stray-work
}

@test "branch: no-upstream is soft refusal (exit 5) without --force" {
  init_repo
  make_merged_branch "feat-a"
  # feat-a has no upstream → soft refuse
  git checkout -q main
  run "$CLI" --branch feat-a
  [ "$status" -eq 5 ]
  echo "$output" | grep -qi "upstream"
}

@test "branch: ahead-of-upstream is soft refusal (exit 5) without --force" {
  init_repo
  git init -q --bare "$WORK/remote.git"
  git remote add origin "$WORK/remote.git"
  git push -q -u origin main
  make_merged_branch "feat-a"
  git push -q -u origin feat-a
  git checkout -q feat-a
  echo extra > e
  git add e
  git commit -q -m "extra unpushed"
  git checkout -q main
  # gh mock: same as test 10 — git-fallback can't see a branch with
  # post-merge commits as merged, so the gh path is needed to reach the
  # branch_soft_safety check at all.
  mock_gh '[{"number":7,"headRefName":"feat-a"}]'
  run "$CLI" --branch feat-a
  [ "$status" -eq 5 ]
  echo "$output" | grep -qi "ahead"
}

@test "branch: --force overrides soft refusal" {
  init_repo
  make_merged_branch "feat-a"
  git checkout -q main
  run "$CLI" --branch feat-a --force
  [ "$status" -eq 0 ]
  ! git show-ref --verify --quiet refs/heads/feat-a
}

@test "branch: state changed (target gone) -> exit 8" {
  init_repo
  make_merged_branch "feat-a"
  git checkout -q main
  git branch -D feat-a >/dev/null  # someone deleted it between plan and execute
  run "$CLI" --branch feat-a
  [ "$status" -eq 8 ]
}

# ─── --all ─────────────────────────────────────────────────────────────

@test "all: deletes every safe candidate; prints summary" {
  init_repo
  make_merged_branch "feat-a"
  make_merged_branch "feat-b"
  git checkout -q main
  run "$CLI" --all --force  # --force here just bypasses no-upstream soft refusal
  [ "$status" -eq 0 ]
  ! git show-ref --verify --quiet refs/heads/feat-a
  ! git show-ref --verify --quiet refs/heads/feat-b
  echo "$output" | grep -qE "2 deleted"
}

@test "all: skip-with-note on branch-local soft refusal (no upstream); continues batch" {
  init_repo
  # Set up remote so we have a mix: feat-a with upstream (safe), feat-b without
  git init -q --bare "$WORK/remote.git"
  git remote add origin "$WORK/remote.git"
  git push -q -u origin main
  make_merged_branch "feat-a"
  git push -q -u origin feat-a
  make_merged_branch "feat-b"
  # feat-b has no upstream — should skip in batch
  git checkout -q main
  run "$CLI" --all
  [ "$status" -eq 0 ]
  ! git show-ref --verify --quiet refs/heads/feat-a   # safe → deleted
  git show-ref --verify --quiet refs/heads/feat-b     # skipped → still there
  echo "$output" | grep -qE "1 deleted, 1 skipped"
}

@test "all: dirty tree hard-stops the whole batch (exit 2)" {
  init_repo
  make_merged_branch "feat-a"
  git checkout -q main
  echo dirty > scratch
  git add scratch
  run "$CLI" --all
  [ "$status" -eq 2 ]
  git show-ref --verify --quiet refs/heads/feat-a   # not touched
}

@test "all: detached HEAD hard-stops the whole batch (exit 6)" {
  init_repo
  make_merged_branch "feat-a"
  git checkout -q main
  git checkout -q --detach HEAD
  run "$CLI" --all
  [ "$status" -eq 6 ]
  git show-ref --verify --quiet refs/heads/feat-a
}

@test "all: nothing merged is a no-op success (exit 0)" {
  init_repo
  run "$CLI" --all
  [ "$status" -eq 0 ]
  echo "$output" | grep -qi "no merged"
}

# ─── usage ─────────────────────────────────────────────────────────────

@test "usage: --help exits 0 and prints modes" {
  run "$CLI" --help
  [ "$status" -eq 0 ]
  echo "$output" | grep -q -- "--plan"
  echo "$output" | grep -q -- "--branch"
  echo "$output" | grep -q -- "--all"
}

@test "usage: no mode -> exit 64" {
  run "$CLI"
  [ "$status" -eq 64 ]
}

@test "usage: --branch without name -> exit 64" {
  run "$CLI" --branch
  [ "$status" -eq 64 ]
}

# ─── T2: /ship hint contract ───────────────────────────────────────────

@test "ship hint: 'Next: /clean' line is present in ship/SKILL.md (T2 regression lock)" {
  # Lives here because the contract is about /clean's discoverability — if
  # someone refactors /ship's tail end and drops the hint, /clean silently
  # loses its callsite. Grep against the rendered SKILL.md (the production
  # artifact); the .tmpl source's intent doesn't matter if generation drops it.
  grep -q "Next: /clean" "$ROOT/ship/SKILL.md"
}
