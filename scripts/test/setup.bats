#!/usr/bin/env bats
# Tests for setup's skill-registration contract.
#
# Why this exists: v0.6.0 renamed /office-hours → /brainstorm and added /debug
# in the repo, but setup's hardcoded SKILL_NAMES array was never updated. Re-running
# setup silently skipped both new skills — they shipped to users without being
# installed. The fix drives registration off the filesystem (every dir-with-SKILL.md);
# this file is the regression coverage so the silent-failure mode can't return.
#
# Run via: bun run test (which shells out to scripts/run-tests.sh)

setup() {
  ROOT="$BATS_TEST_DIRNAME/../.."
  WORK=$(mktemp -d)

  # Mirror the production install shape: a fake $SMRITI_DIR with a copy of setup
  # so $0/dirname resolution finds our fake skill tree, plus a fake $HOME so
  # symlinks land in a sandboxed $SKILLS_DIR. We never touch the user's real
  # ~/.claude/skills.
  # setup uses `pwd -P` to resolve $SMRITI_DIR, which dereferences macOS's
  # /var → /private/var symlink. Resolve our test path the same way so direct
  # string comparison of readlink targets matches.
  FAKE_SMRITI=$(cd "$WORK" && pwd -P)/smriti
  FAKE_HOME=$(cd "$WORK" && pwd -P)/home
  mkdir -p "$FAKE_SMRITI" "$FAKE_HOME/.claude/skills"
  cp "$ROOT/setup" "$FAKE_SMRITI/setup"
  chmod +x "$FAKE_SMRITI/setup"
}

teardown() {
  rm -rf "$WORK"
}

# Run setup against the sandboxed environment. Stdin closed → non-interactive
# branch (BROWSE_ENABLED=false), no bun install (no package.json), no
# gen-skill-docs (no scripts/gen-skill-docs.ts).
run_setup() {
  HOME="$FAKE_HOME" SMRITI_HOME="$FAKE_HOME/.smriti" \
    bash "$FAKE_SMRITI/setup" </dev/null
}

@test "registers every dir that contains SKILL.md" {
  mkdir -p "$FAKE_SMRITI"/{alpha,beta}
  touch "$FAKE_SMRITI/alpha/SKILL.md" "$FAKE_SMRITI/beta/SKILL.md"

  run_setup

  [ -L "$FAKE_HOME/.claude/skills/alpha" ]
  [ -L "$FAKE_HOME/.claude/skills/beta" ]
  [ "$(readlink "$FAKE_HOME/.claude/skills/alpha")" = "$FAKE_SMRITI/alpha" ]
}

@test "skips directories without SKILL.md" {
  # A "skill" dir missing its SKILL.md is half-built (e.g., only .tmpl exists)
  # and must not register — registering would expose a 404 to Claude Code.
  mkdir -p "$FAKE_SMRITI/halfbuilt"
  touch "$FAKE_SMRITI/halfbuilt/SKILL.md.tmpl"  # tmpl only, no generated SKILL.md

  run_setup

  [ ! -e "$FAKE_HOME/.claude/skills/halfbuilt" ]
}

@test "removes stale smriti-managed symlinks (the office-hours → brainstorm bug)" {
  # Reproduces the v0.6.0 failure mode: a skill was renamed in the repo but the
  # old symlink lingers in $SKILLS_DIR pointing at a vanished source dir. Setup
  # must clean this up — otherwise tab-complete keeps offering /office-hours
  # forever and the new /brainstorm never appears.
  mkdir -p "$FAKE_SMRITI/brainstorm"
  touch "$FAKE_SMRITI/brainstorm/SKILL.md"
  ln -s "$FAKE_SMRITI/office-hours" "$FAKE_HOME/.claude/skills/office-hours"

  run_setup

  [ ! -e "$FAKE_HOME/.claude/skills/office-hours" ]
  [ -L "$FAKE_HOME/.claude/skills/brainstorm" ]
}

@test "leaves foreign symlinks alone (user-managed entries are not touched)" {
  # Stale-cleanup is scoped to symlinks whose target prefix is $SMRITI_DIR.
  # Anything pointing elsewhere belongs to the user (their own skills,
  # third-party installs) and must survive setup re-runs.
  mkdir -p "$FAKE_SMRITI/alpha"
  touch "$FAKE_SMRITI/alpha/SKILL.md"
  ln -s "/tmp/some-other-tool" "$FAKE_HOME/.claude/skills/some-other-tool"

  run_setup

  [ -L "$FAKE_HOME/.claude/skills/some-other-tool" ]
  [ "$(readlink "$FAKE_HOME/.claude/skills/some-other-tool")" = "/tmp/some-other-tool" ]
}

@test "preserves existing symlinks pointing at the current source (idempotent)" {
  mkdir -p "$FAKE_SMRITI/alpha"
  touch "$FAKE_SMRITI/alpha/SKILL.md"

  run_setup
  run_setup  # second run must be a no-op contractually

  [ -L "$FAKE_HOME/.claude/skills/alpha" ]
  [ "$(readlink "$FAKE_HOME/.claude/skills/alpha")" = "$FAKE_SMRITI/alpha" ]
}

@test "refuses to clobber a non-symlink at the target path" {
  # If $SKILLS_DIR/<name> is a real dir or file (not a symlink), the user owns
  # it. Setup must skip with a warning rather than nuke it.
  mkdir -p "$FAKE_SMRITI/alpha"
  touch "$FAKE_SMRITI/alpha/SKILL.md"
  mkdir -p "$FAKE_HOME/.claude/skills/alpha"
  touch "$FAKE_HOME/.claude/skills/alpha/user-file.md"

  run_setup

  [ -d "$FAKE_HOME/.claude/skills/alpha" ]
  [ ! -L "$FAKE_HOME/.claude/skills/alpha" ]
  [ -f "$FAKE_HOME/.claude/skills/alpha/user-file.md" ]
}

@test "symlinks umbrella dispatcher to ~/.local/bin/smriti" {
  mkdir -p "$FAKE_SMRITI/bin"
  printf '#!/usr/bin/env bash\necho dispatcher\n' > "$FAKE_SMRITI/bin/smriti"
  chmod +x "$FAKE_SMRITI/bin/smriti"

  run_setup

  [ -L "$FAKE_HOME/.local/bin/smriti" ]
  [ "$(readlink "$FAKE_HOME/.local/bin/smriti")" = "$FAKE_SMRITI/bin/smriti" ]
}

@test "removes stale smriti-managed helper symlinks from ~/.local/bin" {
  mkdir -p "$FAKE_SMRITI/bin"
  printf '#!/usr/bin/env bash\necho dispatcher\n' > "$FAKE_SMRITI/bin/smriti"
  chmod +x "$FAKE_SMRITI/bin/smriti"

  # Simulate old-style individual helper symlinks (the pre-umbrella layout).
  mkdir -p "$FAKE_HOME/.local/bin"
  ln -s "$FAKE_SMRITI/bin/smriti-config" "$FAKE_HOME/.local/bin/smriti-config"
  ln -s "$FAKE_SMRITI/bin/smriti-slug"   "$FAKE_HOME/.local/bin/smriti-slug"
  # Foreign symlink must survive cleanup.
  ln -s "/tmp/other-tool" "$FAKE_HOME/.local/bin/other-tool"

  run_setup

  # Stale helper symlinks cleaned.
  [ ! -e "$FAKE_HOME/.local/bin/smriti-config" ]
  [ ! -e "$FAKE_HOME/.local/bin/smriti-slug" ]
  # Umbrella dispatcher installed.
  [ -L "$FAKE_HOME/.local/bin/smriti" ]
  # Foreign symlink untouched.
  [ -L "$FAKE_HOME/.local/bin/other-tool" ]
}

@test "no hardcoded SKILL_NAMES array — registration is filesystem-driven" {
  # Lint-style guard: the v0.6.0 silent-failure mode came from a hardcoded
  # array that drifted from the repo's skill dirs. If anyone reintroduces it,
  # this test fails loud.
  ! grep -E '^SKILL_NAMES=\(' "$ROOT/setup"
}
