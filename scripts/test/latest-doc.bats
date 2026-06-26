#!/usr/bin/env bats
# Tests for bin/smriti-latest-doc — the single source of truth for per-branch
# doc lookup. These are ROUND-TRIP tests: each writes a doc using the SAME
# filename construction the writer skills use (<branch-slug>-<type>-<ts>.md,
# branch-slug = branch with `/` → `--`), then asserts the helper finds it.
# A glob-only test would re-green through writer/reader drift — the exact bug
# that silently broke every lookup. The round-trip catches drift.
#
# Run via: bun run test (which shells out to scripts/run-tests.sh)

setup() {
  ROOT="$BATS_TEST_DIRNAME/../.."
  WORK=$(mktemp -d)

  FAKE_BIN="$WORK/fake-bin"
  mkdir -p "$FAKE_BIN"
  ln -s "$ROOT/bin/smriti-latest-doc" "$FAKE_BIN/smriti-latest-doc"
  ln -s "$ROOT/bin/smriti-slug" "$FAKE_BIN/smriti-slug"
  CLI="$FAKE_BIN/smriti-latest-doc"

  export SMRITI_HOME="$WORK/state"
  SLUG="test-proj"
  PROJ="$SMRITI_HOME/projects/$SLUG"
  mkdir -p "$PROJ"
}

teardown() {
  cd /
  rm -rf "$WORK"
}

# Mirror the writer contract: <branch-slug>-<type>-<ts>.md, slashes → `--`.
# This is intentionally a re-implementation of the writers' path shape, so the
# test fails if the helper's reader glob drifts away from that shape.
write_doc() {
  local type="$1" branch="$2" ts="$3"
  local branch_slug="${branch//\//--}"
  local f="$PROJ/${branch_slug}-${type}-${ts}.md"
  printf '# doc\n' > "$f"
  # Bump mtime ordering deterministically by ts string is not enough across
  # fast writes; touch with an explicit, monotonically increasing time.
  touch -t "$ts" "$f" 2>/dev/null || true
  echo "$f"
}

@test "round-trip: a written design doc is found by the helper" {
  local want
  want=$(write_doc design my-branch 202606010000.00)
  run "$CLI" --type design --slug "$SLUG" --branch my-branch
  [ "$status" -eq 0 ]
  [ "$output" = "$want" ]
}

@test "round-trip: a written plan doc is found by the helper" {
  local want
  want=$(write_doc plan my-branch 202606010000.00)
  run "$CLI" --type plan --slug "$SLUG" --branch my-branch
  [ "$status" -eq 0 ]
  [ "$output" = "$want" ]
}

@test "round-trip: a written debug doc is found by the helper" {
  local want
  want=$(write_doc debug my-branch 202606010000.00)
  run "$CLI" --type debug --slug "$SLUG" --branch my-branch
  [ "$status" -eq 0 ]
  [ "$output" = "$want" ]
}

@test "newest wins: returns the most-recent doc by mtime" {
  write_doc design my-branch 202601010000.00 >/dev/null
  local newest
  newest=$(write_doc design my-branch 202612310000.00)
  run "$CLI" --type design --slug "$SLUG" --branch my-branch
  [ "$status" -eq 0 ]
  [ "$output" = "$newest" ]
}

@test "type isolation: --type plan ignores design docs on the same branch" {
  write_doc design my-branch 202606010000.00 >/dev/null
  local plan
  plan=$(write_doc plan my-branch 202606010000.00)
  run "$CLI" --type plan --slug "$SLUG" --branch my-branch
  [ "$status" -eq 0 ]
  [ "$output" = "$plan" ]
}

@test "branch slug: a slash in the branch name maps to --" {
  local want
  want=$(write_doc design feat/login 202606010000.00)
  # Filename uses feat--login; querying with the slashed branch must still find it.
  run "$CLI" --type design --slug "$SLUG" --branch feat/login
  [ "$status" -eq 0 ]
  [ "$output" = "$want" ]
}

@test "no match: empty output, exit 0 (callers test for empty)" {
  run "$CLI" --type plan --slug "$SLUG" --branch my-branch
  [ "$status" -eq 0 ]
  [ -z "$output" ]
}

@test "no-match does NOT fall through to listing the cwd" {
  # Regression guard for the original bug: a literal unmatched glob fed to
  # `ls` would list the current directory. nullglob must prevent that.
  cd "$ROOT"
  run "$CLI" --type plan --slug "$SLUG" --branch nonexistent-branch
  [ "$status" -eq 0 ]
  [ -z "$output" ]
}

@test "--all: lists every matching doc, newest first" {
  local older newer
  older=$(write_doc design my-branch 202601010000.00)
  newer=$(write_doc design my-branch 202612310000.00)
  run "$CLI" --type design --slug "$SLUG" --branch my-branch --all
  [ "$status" -eq 0 ]
  # First line is the newest, both present.
  [ "$(echo "$output" | sed -n 1p)" = "$newer" ]
  echo "$output" | grep -qF "$older"
}

@test "usage error: missing --type exits 2" {
  run "$CLI" --slug "$SLUG" --branch my-branch
  [ "$status" -eq 2 ]
}

@test "usage error: invalid --type exits 2" {
  run "$CLI" --type bogus --slug "$SLUG" --branch my-branch
  [ "$status" -eq 2 ]
}

@test "usage error: unknown flag exits 2" {
  run "$CLI" --type design --frobnicate
  [ "$status" -eq 2 ]
}

@test "usage error: --type with no value exits 2 (not a shift-failure 1)" {
  run "$CLI" --type
  [ "$status" -eq 2 ]
}

@test "usage error: --slug with no value exits 2" {
  run "$CLI" --type design --slug
  [ "$status" -eq 2 ]
}

@test "usage error: --branch with no value exits 2" {
  run "$CLI" --type design --branch
  [ "$status" -eq 2 ]
}
