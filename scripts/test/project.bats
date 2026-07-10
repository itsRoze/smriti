#!/usr/bin/env bats
# Tests for bin/smriti-project — CLI for managing the set of smriti-tracked projects.
# Run via: bun run test (which shells out to scripts/run-tests.sh)

setup() {
  ROOT="$BATS_TEST_DIRNAME/../.."
  WORK=$(mktemp -d)

  # Production-shape invocation: symlink BOTH bins into a fake PATH dir so we
  # exercise the same install shape /ship uses (~/.local/bin/smriti-* symlinks).
  # The lesson — absolute-path invocation hides path-resolution bugs
  # that symlinked production installs hit. smriti-project's `current` subcommand calls its sibling
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

@test "list: counts plans and designs per project, skips _archive" {
  mkdir -p "$SMRITI_HOME/projects/alpha" "$SMRITI_HOME/projects/_archive/old-proj"
  touch "$SMRITI_HOME/projects/alpha/main-plan-2026-05-01T00-00-00Z.md"
  touch "$SMRITI_HOME/projects/alpha/main-plan-2026-05-02T00-00-00Z.md"
  touch "$SMRITI_HOME/projects/alpha/feat-x-plan-2026-05-03T00-00-00Z.md"
  touch "$SMRITI_HOME/projects/alpha/main-design-2026-05-01T00-00-00Z.md"
  touch "$SMRITI_HOME/projects/alpha/feat-x-design-2026-05-02T00-00-00Z.md"

  run "$CLI" list
  [ "$status" -eq 0 ]
  [[ "$output" == *"alpha"* ]]
  # 3 plans, 2 designs in the alpha row (PATH column follows).
  echo "$output" | grep -E '^alpha[[:space:]].+[[:space:]]3[[:space:]]+2'
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
  touch "$SMRITI_HOME/projects/doomed/main-plan-2026-05-01T00-00-00Z.md"
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

@test "forget: rejects slug with '/' or leading '.' before rm -rf (path-traversal guard)" {
  # The vulnerability: without this guard, `forget ../slug-cache --yes` would
  # resolve to ~/.smriti/slug-cache, pass the [ -d ] check, and rm -rf the
  # entire slug-cache, making every repo on the machine forget its slug.
  mkdir -p "$SMRITI_HOME/slug-cache"
  printf 'sentinel' > "$SMRITI_HOME/slug-cache/sentinel"

  run "$CLI" forget ../slug-cache --yes
  [ "$status" -eq 2 ]
  [[ "$output" == *"invalid slug"* ]]
  # Cache dir untouched — this is the load-bearing assertion.
  [ -f "$SMRITI_HOME/slug-cache/sentinel" ]

  run "$CLI" forget .hidden --yes
  [ "$status" -eq 2 ]

  run "$CLI" forget "with/slash" --yes
  [ "$status" -eq 2 ]
}

@test "forget: missing slug arg exits 2 with usage" {
  run "$CLI" forget
  [ "$status" -eq 2 ]
  [[ "$output" == *"usage:"* ]]
}

@test "new: creates directory with git repo and prints next steps" {
  cd "$WORK"
  run "$CLI" new my-cool-project
  [ "$status" -eq 0 ]
  [[ "$output" == *"Created: my-cool-project/"* ]]
  [[ "$output" == *"/bootstrap"* ]]
  [ -d "$WORK/my-cool-project/.git" ]
}

@test "new: refuses if directory already exists" {
  mkdir -p "$WORK/existing-dir"
  run "$CLI" new "$WORK/existing-dir"
  [ "$status" -eq 1 ]
  [[ "$output" == *"already exists"* ]]
}

@test "new: missing name arg exits 2 with usage" {
  run "$CLI" new
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

@test "list: shows PATH from new-format cache files, (unknown) for old-format" {
  mkdir -p "$SMRITI_HOME/projects/with-path" "$SMRITI_HOME/projects/no-path"
  # New-format cache file with SOURCE_PATH.
  printf 'SLUG=with-path\nSOURCE_PATH=/tmp/my-repo\n' > "$SMRITI_HOME/slug-cache/aaaaaaaaaaaaaaaa"
  mkdir -p /tmp/my-repo
  # Old-format cache file (just the slug, no KV).
  printf 'no-path' > "$SMRITI_HOME/slug-cache/bbbbbbbbbbbbbbbb"

  run "$CLI" list
  [ "$status" -eq 0 ]
  echo "$output" | grep 'with-path' | grep '/tmp/my-repo'
  echo "$output" | grep 'no-path' | grep '(unknown)'
  rmdir /tmp/my-repo 2>/dev/null || true
}

@test "list: shows (stale: ...) for nonexistent SOURCE_PATH" {
  mkdir -p "$SMRITI_HOME/projects/stale-proj"
  printf 'SLUG=stale-proj\nSOURCE_PATH=/nonexistent/path/that/does/not/exist\n' > "$SMRITI_HOME/slug-cache/dddddddddddddddd"

  run "$CLI" list
  [ "$status" -eq 0 ]
  echo "$output" | grep 'stale-proj' | grep '(stale:'
}

@test "forget: works with new-format (KV) cache files" {
  mkdir -p "$SMRITI_HOME/projects/kv-doomed"
  printf 'SLUG=kv-doomed\nSOURCE_PATH=/tmp/kv-repo\n' > "$SMRITI_HOME/slug-cache/eeeeeeeeeeeeeeee"
  printf 'SLUG=kv-doomed\nSOURCE_PATH=/tmp/kv-repo-clone\n' > "$SMRITI_HOME/slug-cache/ffffffffffffffff"
  # Unrelated new-format entry must survive.
  printf 'SLUG=kv-survivor\nSOURCE_PATH=/tmp/survivor\n' > "$SMRITI_HOME/slug-cache/1111111111111111"

  run "$CLI" forget kv-doomed --yes
  [ "$status" -eq 0 ]
  [[ "$output" == *"forgot: kv-doomed"* ]]
  [ ! -d "$SMRITI_HOME/projects/kv-doomed" ]
  [ ! -f "$SMRITI_HOME/slug-cache/eeeeeeeeeeeeeeee" ]
  [ ! -f "$SMRITI_HOME/slug-cache/ffffffffffffffff" ]
  [ -f "$SMRITI_HOME/slug-cache/1111111111111111" ]
}

@test "rename: moves project dir and updates cache files" {
  mkdir -p "$SMRITI_HOME/projects/old-name"
  touch "$SMRITI_HOME/projects/old-name/main-plan-2026-05-01T00-00-00Z.md"
  printf 'SLUG=old-name\nSOURCE_PATH=/tmp/my-repo\n' > "$SMRITI_HOME/slug-cache/aaaaaaaaaaaaaaaa"
  printf 'SLUG=old-name\nSOURCE_PATH=/tmp/my-repo-clone\n' > "$SMRITI_HOME/slug-cache/bbbbbbbbbbbbbbbb"
  # Unrelated cache entry must not be touched.
  printf 'SLUG=other\nSOURCE_PATH=/tmp/other\n' > "$SMRITI_HOME/slug-cache/cccccccccccccccc"

  run "$CLI" rename old-name new-name
  [ "$status" -eq 0 ]
  [[ "$output" == *"renamed: old-name -> new-name"* ]]
  [[ "$output" == *"2 slug-cache"* ]]

  [ ! -d "$SMRITI_HOME/projects/old-name" ]
  [ -d "$SMRITI_HOME/projects/new-name" ]
  [ -f "$SMRITI_HOME/projects/new-name/main-plan-2026-05-01T00-00-00Z.md" ]

  # Cache files rewritten with new slug.
  grep -q '^SLUG=new-name$' "$SMRITI_HOME/slug-cache/aaaaaaaaaaaaaaaa"
  grep -q 'SOURCE_PATH=/tmp/my-repo$' "$SMRITI_HOME/slug-cache/aaaaaaaaaaaaaaaa"
  grep -q '^SLUG=new-name$' "$SMRITI_HOME/slug-cache/bbbbbbbbbbbbbbbb"
  # Unrelated entry unchanged.
  grep -q '^SLUG=other$' "$SMRITI_HOME/slug-cache/cccccccccccccccc"
}

@test "rename: refuses if old slug does not exist" {
  run "$CLI" rename ghost new-name
  [ "$status" -eq 1 ]
  [[ "$output" == *"no project named"* ]]
}

@test "rename: refuses if new slug already exists" {
  mkdir -p "$SMRITI_HOME/projects/src" "$SMRITI_HOME/projects/dst"
  run "$CLI" rename src dst
  [ "$status" -eq 1 ]
  [[ "$output" == *"already exists"* ]]
  # Both dirs untouched.
  [ -d "$SMRITI_HOME/projects/src" ]
  [ -d "$SMRITI_HOME/projects/dst" ]
}

@test "rename: refuses old == new" {
  mkdir -p "$SMRITI_HOME/projects/same"
  run "$CLI" rename same same
  [ "$status" -eq 1 ]
  [[ "$output" == *"same"* ]]
}

@test "rename: rejects invalid slugs (path traversal, reserved names)" {
  mkdir -p "$SMRITI_HOME/projects/legit"
  run "$CLI" rename ../evil legit
  [ "$status" -eq 2 ]
  [[ "$output" == *"invalid"* ]]

  run "$CLI" rename legit ../evil
  [ "$status" -eq 2 ]

  run "$CLI" rename legit _archive
  [ "$status" -eq 2 ]
  [[ "$output" == *"reserved"* ]]
}

@test "rename: missing args exits 2 with usage" {
  run "$CLI" rename
  [ "$status" -eq 2 ]
  [[ "$output" == *"usage:"* ]]

  run "$CLI" rename only-one
  [ "$status" -eq 2 ]
}

@test "rename: succeeds with zero cache files (project dir only)" {
  mkdir -p "$SMRITI_HOME/projects/orphan"
  run "$CLI" rename orphan rescued
  [ "$status" -eq 0 ]
  [[ "$output" == *"renamed: orphan -> rescued"* ]]
  [[ "$output" == *"0 slug-cache"* ]]
  [ -d "$SMRITI_HOME/projects/rescued" ]
  [ ! -d "$SMRITI_HOME/projects/orphan" ]
}

@test "unknown subcommand: exits 2" {
  run "$CLI" bogus
  [ "$status" -eq 2 ]
  [[ "$output" == *"unknown command"* ]]
}
