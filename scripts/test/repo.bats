#!/usr/bin/env bats
# Tests for bin/smriti-repo — the app: one codebase and everything smriti knows
# about it. This file was project.bats until projects became an entity of their
# own; every verb here has always operated on a repository.
# Run via: bun run test (which shells out to scripts/run-tests.sh)

setup() {
  ROOT="$BATS_TEST_DIRNAME/../.."
  WORK=$(mktemp -d)

  # Production-shape invocation: symlink the bins into a fake PATH dir so we
  # exercise the real install shape (~/.local/bin/smriti-* symlinks).
  # The lesson — absolute-path invocation hides path-resolution bugs that
  # symlinked production installs hit. smriti-repo now resolves SMRITI_LIB
  # through the same chain to source lib/factory-db.sh, so a partial resolution
  # here would fail every db-backed verb with "schema not found".
  FAKE_BIN="$WORK/fake-bin"
  mkdir -p "$FAKE_BIN"
  ln -s "$ROOT/bin/smriti-repo"    "$FAKE_BIN/smriti-repo"
  ln -s "$ROOT/bin/smriti-ticket"  "$FAKE_BIN/smriti-ticket"
  ln -s "$ROOT/bin/smriti-project" "$FAKE_BIN/smriti-project"
  ln -s "$ROOT/bin/smriti-slug"    "$FAKE_BIN/smriti-slug"
  CLI="$FAKE_BIN/smriti-repo"
  TICKET="$FAKE_BIN/smriti-ticket"
  PROJECT="$FAKE_BIN/smriti-project"

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
  [[ "$output" == *"no apps tracked yet"* ]]
}

@test "list: nothing tracked at all still exits 0 with a hint" {
  run "$CLI" list
  [ "$status" -eq 0 ]
  [[ "$output" == *"no apps tracked yet"* ]]
}

@test "list: counts plans per app, skips _archive" {
  mkdir -p "$SMRITI_HOME/projects/alpha" "$SMRITI_HOME/projects/_archive/old-proj"
  touch "$SMRITI_HOME/projects/alpha/main-plan-2026-05-01T00-00-00Z.md"
  touch "$SMRITI_HOME/projects/alpha/main-plan-2026-05-02T00-00-00Z.md"
  touch "$SMRITI_HOME/projects/alpha/feat-x-plan-2026-05-03T00-00-00Z.md"
  touch "$SMRITI_HOME/projects/alpha/main-design-2026-05-01T00-00-00Z.md"
  touch "$SMRITI_HOME/projects/alpha/feat-x-design-2026-05-02T00-00-00Z.md"

  run "$CLI" list
  [ "$status" -eq 0 ]
  [[ "$output" == *"alpha"* ]]
  # 3 plans in the alpha row (PATH column follows).
  echo "$output" | grep -E '^alpha[[:space:]].+[[:space:]]3[[:space:]]'
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
  [[ "$output" == *"no app named"* ]]
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
  [[ "$output" == *"/begin"* ]]
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
  [[ "$output" == *"no app named"* ]]
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

# ─── the db-backed half ─────────────────────────────────────────────────────
# `smriti repo` was filesystem-only until projects became real. These cover the
# part that now reaches factory.db — and the rename bug that made it necessary.

db() { sqlite3 "$SMRITI_HOME/factory.db" "$1"; }

# A repo whose slug resolves deterministically, so ticket/project writes land
# under a known app.
seed_repo() {
  mkdir -p "$WORK/repo" && cd "$WORK/repo"
  git init -q -b main
  git config user.email "test@smriti.local"
  git config user.name "smriti-test"
  git remote add origin "https://github.com/test/demo.git"
}

@test "rename: carries every db row with it, not just the directory on disk" {
  # The bug this exists for: rename moved ~/.smriti/projects/<slug>/ and the
  # slug-cache and left every ticket, document and run behind under a slug that
  # no longer existed.
  seed_repo
  "$TICKET" add "Export to CSV" >/dev/null
  "$PROJECT" add "Search v2" >/dev/null
  "$TICKET" doc 1 --type plan --path "$WORK/a-plan-1.md" >/dev/null
  mkdir -p "$SMRITI_HOME/projects/test-demo"

  run "$CLI" rename test-demo renamed-demo
  [ "$status" -eq 0 ]
  [[ "$output" == *"1 ticket(s)"* ]]
  [[ "$output" == *"1 project(s)"* ]]

  [ "$(db "SELECT repo_slug FROM tickets WHERE id=1;")" = "renamed-demo" ]
  [ "$(db "SELECT repo_slug FROM projects WHERE id=1;")" = "renamed-demo" ]
  [ "$(db "SELECT repo_slug FROM documents WHERE id=1;")" = "renamed-demo" ]
  # Nothing may be left pointing at the old slug.
  [ "$(db "SELECT (SELECT count(*) FROM tickets WHERE repo_slug='test-demo')
                + (SELECT count(*) FROM projects WHERE repo_slug='test-demo')
                + (SELECT count(*) FROM documents WHERE repo_slug='test-demo')
                + (SELECT count(*) FROM runs WHERE repo_slug='test-demo');")" = "0" ]
}

@test "rename: moves the attributes row too" {
  seed_repo
  mkdir -p "$SMRITI_HOME/projects/test-demo"
  "$CLI" edit test-demo --description "the meta-tool" >/dev/null

  "$CLI" rename test-demo renamed-demo >/dev/null
  [ "$(db "SELECT description FROM repositories WHERE slug='renamed-demo';")" = "the meta-tool" ]
  [ "$(db "SELECT count(*) FROM repositories WHERE slug='test-demo';")" = "0" ]
}

@test "edit: upserts a description for an app with no row yet, and can clear it" {
  seed_repo
  run "$CLI" edit test-demo --description "the meta-tool"
  [ "$status" -eq 0 ]
  [ "$(db "SELECT description FROM repositories WHERE slug='test-demo';")" = "the meta-tool" ]

  "$CLI" edit test-demo --description "" >/dev/null
  [ "$(db "SELECT coalesce(description,'NULL') FROM repositories WHERE slug='test-demo';")" = "NULL" ]
}

@test "edit: --name does not clobber a description, and vice versa" {
  seed_repo
  "$CLI" edit test-demo --description "keep me" >/dev/null
  "$CLI" edit test-demo --name "Demo" >/dev/null
  [ "$(db "SELECT description FROM repositories WHERE slug='test-demo';")" = "keep me" ]
  [ "$(db "SELECT name FROM repositories WHERE slug='test-demo';")" = "Demo" ]
}

@test "edit: with no fields is a usage error" {
  run "$CLI" edit test-demo
  [ "$status" -eq 2 ]
}

@test "show: --json carries what the board needs to render a page" {
  seed_repo
  cat > "$WORK/repo/PROJECT.md" <<'EOF'
# Project: demo
EOF
  "$TICKET" add "Export to CSV" >/dev/null
  "$PROJECT" add "Search v2" >/dev/null

  run "$CLI" show test-demo --json
  [ "$status" -eq 0 ]
  echo "$output" | jq -e '.slug and .name and .counts'
  [ "$(echo "$output" | jq -r '.counts.tickets')" = "1" ]
  [ "$(echo "$output" | jq -r '.counts.projects')" = "1" ]
  [ "$(echo "$output" | jq -r '.project_md')" != "null" ]
  # No DESIGN.md in the fixture: absent must be null, not an invented path.
  [ "$(echo "$output" | jq -r '.design_md')" = "null" ]
}

@test "show: --json escapes a description containing quotes and newlines" {
  # json_object() rather than hand-assembled JSON is what makes this hold.
  seed_repo
  "$CLI" edit test-demo --description "$(printf 'has "quotes"\nand a newline')" >/dev/null
  run "$CLI" show test-demo --json
  [ "$status" -eq 0 ]
  echo "$output" | jq -e '.description'
  [[ "$(echo "$output" | jq -r '.description')" == *'"quotes"'* ]]
}

@test "list: --json is an array the board can read, one entry per app" {
  seed_repo
  "$TICKET" add "Export to CSV" >/dev/null
  mkdir -p "$SMRITI_HOME/projects/fs-only"

  run "$CLI" list --json
  [ "$status" -eq 0 ]
  # Derived existence: an app with only a ticket AND an app with only a state
  # directory both appear, without either needing a repositories row.
  [[ "$output" == *"test-demo"* ]]
  [[ "$output" == *"fs-only"* ]]
  echo "$output" | jq -e 'length >= 2'
}

@test "forget: keeps the work and says so" {
  seed_repo
  "$TICKET" add "Export to CSV" >/dev/null
  "$PROJECT" add "Search v2" >/dev/null
  mkdir -p "$SMRITI_HOME/projects/test-demo"
  "$CLI" edit test-demo --description "gone soon" >/dev/null

  run "$CLI" forget test-demo --yes
  [ "$status" -eq 0 ]
  [[ "$output" == *"kept 1 ticket(s)"* ]]
  # The attributes row goes; work history is not app state and stays.
  [ "$(db "SELECT count(*) FROM repositories WHERE slug='test-demo';")" = "0" ]
  [ "$(db "SELECT count(*) FROM tickets;")" = "1" ]
  [ "$(db "SELECT count(*) FROM projects;")" = "1" ]
}

@test "the filesystem-only verbs still work with no sqlite3 database at all" {
  # smriti-repo gained a db dependency; new/current/list must not have.
  [ ! -f "$SMRITI_HOME/factory.db" ]
  mkdir -p "$SMRITI_HOME/projects/alpha"

  run "$CLI" list
  [ "$status" -eq 0 ]
  [[ "$output" == *"alpha"* ]]

  cd "$WORK"
  run "$CLI" new fresh-thing
  [ "$status" -eq 0 ]

  # Still no database: a read must not conjure one into being.
  [ ! -f "$SMRITI_HOME/factory.db" ]
}

@test "list --json: works with no factory.db, and creates no stray files" {
  # repo_json's empty-store branch passed its SQL as the DATABASE FILENAME, so
  # sqlite3 opened the statement as a file, printed a parse error, consumed the
  # caller's stdin as SQL, and left a file in the cwd named after the query.
  mkdir -p "$SMRITI_HOME/projects/appone" "$SMRITI_HOME/projects/apptwo"
  cd "$WORK"
  [ ! -f "$SMRITI_HOME/factory.db" ]

  run "$CLI" list --json
  [ "$status" -eq 0 ]
  echo "$output" | jq -e 'length == 2'
  [ "$(echo "$output" | jq -r '.[0].slug')" = "appone" ]
  [ "$(echo "$output" | jq -r '.[0].counts.tickets')" = "0" ]
  # Nothing named after the SQL may appear anywhere.
  [ -z "$(find "$WORK" "$SMRITI_HOME" -name 'SELECT*' 2>/dev/null)" ]
  [ ! -f "$SMRITI_HOME/factory.db" ]
}

@test "show --json: an app with no factory.db still returns an object" {
  # The board's repo-doc route parses this; empty output made it 404 forever.
  mkdir -p "$SMRITI_HOME/projects/appone"
  cd "$WORK"
  run "$CLI" show appone --json
  [ "$status" -eq 0 ]
  echo "$output" | jq -e '.slug == "appone" and has("repo_path") and has("counts")'
}
