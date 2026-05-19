#!/usr/bin/env bats
# Tests for bin/smriti-project — CLI for managing the set of smriti-tracked projects.
# Run via: bun run test (which shells out to scripts/run-tests.sh)

setup() {
  ROOT="$BATS_TEST_DIRNAME/../.."
  WORK=$(mktemp -d)

  # Production-shape invocation: symlink BOTH bins into a fake PATH dir so we
  # exercise the same install shape /ship uses (~/.local/bin/smriti-* symlinks).
  # Same lesson as ELI-37 — absolute-path invocation hides path-resolution bugs
  # like ELI-36. smriti-project's `current` subcommand calls its sibling
  # smriti-slug; the symlink test catches sibling-resolution regressions.
  FAKE_BIN="$WORK/fake-bin"
  mkdir -p "$FAKE_BIN"
  ln -s "$ROOT/bin/smriti-project" "$FAKE_BIN/smriti-project"
  ln -s "$ROOT/bin/smriti-slug"    "$FAKE_BIN/smriti-slug"
  CLI="$FAKE_BIN/smriti-project"

  # Isolated runtime state — never touch the user's real ~/.smriti.
  export SMRITI_HOME="$WORK/state"
  mkdir -p "$SMRITI_HOME/projects" "$SMRITI_HOME/slug-cache"
}

teardown() {
  cd /
  rm -rf "$WORK"
}

@test "list: empty state prints a hint, exits 0" {
  rm -rf "$SMRITI_HOME/projects"
  run "$CLI" list
  [ "$status" -eq 0 ]
  [[ "$output" == *"no projects tracked yet"* ]]
}

@test "list: no tracked projects (dir exists, empty) prints (none) hint" {
  run "$CLI" list
  [ "$status" -eq 0 ]
  [[ "$output" == *"(none"* ]]
}

@test "list: counts learnings and designs per project, skips _archive" {
  mkdir -p "$SMRITI_HOME/projects/alpha" "$SMRITI_HOME/projects/_archive/old-proj"
  printf '{}\n{}\n{}\n' > "$SMRITI_HOME/projects/alpha/learnings.jsonl"
  touch "$SMRITI_HOME/projects/alpha/main-design-2026-05-01T00-00-00Z.md"
  touch "$SMRITI_HOME/projects/alpha/feat-x-design-2026-05-02T00-00-00Z.md"

  run "$CLI" list
  [ "$status" -eq 0 ]
  [[ "$output" == *"alpha"* ]]
  # 3 learnings, 2 designs in the alpha row.
  echo "$output" | grep -E '^alpha[[:space:]].+[[:space:]]3[[:space:]]+2[[:space:]]*$'
  # _archive is excluded from the listing.
  ! [[ "$output" == *"_archive"* ]]
}

@test "current: prints the same slug as smriti-slug --print" {
  # Run from inside the smriti repo so the slug resolves deterministically.
  cd "$ROOT"
  expected=$("$FAKE_BIN/smriti-slug" --print)
  run "$CLI" current
  [ "$status" -eq 0 ]
  [ "$output" = "$expected" ]
}

@test "forget: --yes removes project dir AND every slug-cache file pointing at it" {
  # Two cache files map to the same slug (same repo, two clones). Both must go.
  mkdir -p "$SMRITI_HOME/projects/doomed"
  printf '{}\n' > "$SMRITI_HOME/projects/doomed/learnings.jsonl"
  printf 'doomed' > "$SMRITI_HOME/slug-cache/aaaaaaaaaaaaaaaa"
  printf 'doomed' > "$SMRITI_HOME/slug-cache/bbbbbbbbbbbbbbbb"
  # A cache entry for an unrelated slug must survive.
  printf 'survivor' > "$SMRITI_HOME/slug-cache/cccccccccccccccc"

  run "$CLI" forget doomed --yes
  [ "$status" -eq 0 ]
  [[ "$output" == *"forgot: doomed"* ]]

  [ ! -d "$SMRITI_HOME/projects/doomed" ]
  [ ! -f "$SMRITI_HOME/slug-cache/aaaaaaaaaaaaaaaa" ]
  [ ! -f "$SMRITI_HOME/slug-cache/bbbbbbbbbbbbbbbb" ]
  # Unrelated cache entry intact — this is the acceptance contract: cache deletion
  # is keyed by slug content, not by everything under slug-cache/.
  [ "$(cat "$SMRITI_HOME/slug-cache/cccccccccccccccc")" = "survivor" ]
}

@test "forget: --yes mentions PROJECT.md / DESIGN.md reminder" {
  mkdir -p "$SMRITI_HOME/projects/temp"
  run "$CLI" forget temp --yes
  [ "$status" -eq 0 ]
  [[ "$output" == *"PROJECT.md"* ]]
  [[ "$output" == *"DESIGN.md"* ]]
}

@test "forget: unknown slug exits 1 with explicit error" {
  run "$CLI" forget never-existed --yes
  [ "$status" -eq 1 ]
  [[ "$output" == *"no project named"* ]]
}

@test "forget: refuses in non-interactive shell without --yes" {
  mkdir -p "$SMRITI_HOME/projects/safe"
  # </dev/null forces non-interactive; without --yes the script must refuse,
  # not hang on `read` or silently proceed.
  run bash -c "'$CLI' forget safe </dev/null"
  [ "$status" -eq 1 ]
  [[ "$output" == *"refusing to forget without --yes"* ]]
  # Project dir untouched.
  [ -d "$SMRITI_HOME/projects/safe" ]
}

@test "forget: missing slug arg exits 2 with usage" {
  run "$CLI" forget
  [ "$status" -eq 2 ]
  [[ "$output" == *"usage:"* ]]
}

@test "no args / -h / --help: prints usage, exits 2" {
  run "$CLI"
  [ "$status" -eq 2 ]
  [[ "$output" == *"usage:"* ]]

  run "$CLI" --help
  [ "$status" -eq 2 ]
  [[ "$output" == *"usage:"* ]]
}

@test "unknown subcommand: exits 2" {
  run "$CLI" bogus
  [ "$status" -eq 2 ]
  [[ "$output" == *"unknown command"* ]]
}
