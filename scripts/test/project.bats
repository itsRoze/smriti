#!/usr/bin/env bats
# Tests for bin/smriti-project — a named body of work: the grouping between an
# app and a ticket. (The old project.bats, which tested repositories, is now
# repo.bats.)
# Run via: bun run test (which shells out to scripts/run-tests.sh)

setup() {
  ROOT="$BATS_TEST_DIRNAME/../.."
  WORK=$(mktemp -d)

  # Production-shape invocation: symlinks into a fake PATH dir, not in-repo
  # paths. smriti-project resolves SMRITI_LIB through the symlink chain to
  # source lib/factory-db.sh; a partial resolution fails every verb here with
  # "schema not found", which absolute-path invocation would hide.
  FAKE_BIN="$WORK/fake-bin"
  REPO="$WORK/repo"
  mkdir -p "$FAKE_BIN" "$REPO"
  ln -s "$ROOT/bin/smriti-project" "$FAKE_BIN/smriti-project"
  ln -s "$ROOT/bin/smriti-ticket"  "$FAKE_BIN/smriti-ticket"
  ln -s "$ROOT/bin/smriti-slug"    "$FAKE_BIN/smriti-slug"
  CLI="$FAKE_BIN/smriti-project"
  TICKET="$FAKE_BIN/smriti-ticket"

  export SMRITI_HOME="$WORK/state"
  mkdir -p "$SMRITI_HOME"

  ORIG_PATH="$PATH"
  PATH="$FAKE_BIN:$PATH"

  cd "$REPO"
  git init -q -b main
  git config user.email "test@smriti.local"
  git config user.name "smriti-test"
  git remote add origin "https://github.com/test/demo.git"
}

teardown() {
  PATH="$ORIG_PATH"
  cd /
  rm -rf "$WORK"
}

db() { sqlite3 "$SMRITI_HOME/factory.db" "$1"; }

# ─── add ────────────────────────────────────────────────────────────────────

@test "add: derives the app from the repo you are standing in" {
  run "$CLI" add "Search v2"
  [ "$status" -eq 0 ]
  [[ "$output" == *"#1"* ]]
  [[ "$output" == *"test-demo"* ]]
  [ "$(db "SELECT repo_slug FROM projects WHERE id=1;")" = "test-demo" ]
  [ "$(db "SELECT slug FROM projects WHERE id=1;")" = "search-v2" ]
}

@test "add: with no app is a legitimate state, not an error" {
  # An idea you have not written any code for yet. Requiring an app here would
  # make the thought uncapturable at the moment you had it.
  cd "$WORK"
  run "$CLI" add "A writing app"
  [ "$status" -eq 0 ]
  [[ "$output" == *"no app yet"* ]]
  [ "$(db "SELECT count(*) FROM projects WHERE repo_slug IS NULL;")" = "1" ]
}

@test "add: --repo - means no app even from inside a repo" {
  run "$CLI" add "Someday" --repo -
  [ "$status" -eq 0 ]
  [ "$(db "SELECT count(*) FROM projects WHERE repo_slug IS NULL;")" = "1" ]
}

@test "add: an explicit --slug overrides the derived one" {
  "$CLI" add "Search v2" --slug srch >/dev/null
  [ "$(db "SELECT slug FROM projects WHERE id=1;")" = "srch" ]
}

@test "add: a slug is unique within an app, but free across apps" {
  "$CLI" add "Cleanup" >/dev/null
  run "$CLI" add "Cleanup"
  [ "$status" -ne 0 ]
  [[ "$output" == *"already exists"* ]]

  # Same handle in a different app is fine — that is what "within" means.
  run "$CLI" add "Cleanup" --repo other-app
  [ "$status" -eq 0 ]
}

@test "add: rejects a name that could escape the store" {
  run "$CLI" add "x" --slug "../evil"
  [ "$status" -eq 2 ]
  [[ "$output" == *"invalid"* ]]
}

@test "add: a multi-line name is refused" {
  run "$CLI" add "$(printf 'one\ntwo')"
  [ "$status" -eq 2 ]
  [[ "$output" == *"single line"* ]]
}

# ─── list / show ────────────────────────────────────────────────────────────

@test "list: reading before the store exists creates no database" {
  run "$CLI" list
  [ "$status" -eq 0 ]
  [ ! -f "$SMRITI_HOME/factory.db" ]
}

@test "list: --json on an empty store is a valid empty array" {
  run "$CLI" list --json
  [ "$status" -eq 0 ]
  [ "$(echo "$output" | jq -r 'length')" = "0" ]
}

@test "list: --json carries the ticket counts the board renders" {
  "$CLI" add "Search v2" >/dev/null
  "$TICKET" add "index it" --project search-v2 >/dev/null
  "$TICKET" add "rank it" --project search-v2 >/dev/null
  "$TICKET" done 2 >/dev/null

  run "$CLI" list --json
  [ "$status" -eq 0 ]
  echo "$output" | jq -e '.[0] | .id and .name and .slug and .repo_slug'
  [ "$(echo "$output" | jq -r '.[0].tickets')" = "2" ]
  [ "$(echo "$output" | jq -r '.[0].open')" = "1" ]
}

@test "list: --repo scopes, and --repo - finds the app-less ones" {
  "$CLI" add "Here" >/dev/null
  "$CLI" add "Nowhere" --repo - >/dev/null

  run "$CLI" list --repo test-demo
  [[ "$output" == *"Here"* ]]
  ! [[ "$output" == *"Nowhere"* ]]

  run "$CLI" list --repo -
  [[ "$output" == *"Nowhere"* ]]
  ! [[ "$output" == *"Here"* ]]
}

@test "list: done projects are hidden unless --all" {
  "$CLI" add "Finished" >/dev/null
  "$CLI" done 1 >/dev/null
  run "$CLI" list
  ! [[ "$output" == *"Finished"* ]]
  run "$CLI" list --all
  [[ "$output" == *"Finished"* ]]
}

@test "show: accepts either the id or the slug" {
  "$CLI" add "Search v2" >/dev/null
  run "$CLI" show 1
  [ "$status" -eq 0 ]
  [[ "$output" == *"Search v2"* ]]

  run "$CLI" show search-v2
  [ "$status" -eq 0 ]
  [[ "$output" == *"Search v2"* ]]
}

@test "show: lists the tickets filed into it" {
  "$CLI" add "Search v2" >/dev/null
  "$TICKET" add "index it" --project search-v2 >/dev/null
  run "$CLI" show search-v2
  [[ "$output" == *"index it"* ]]
}

@test "show: an ambiguous slug asks which app rather than guessing" {
  # Same handle in two apps, and we are standing in neither.
  "$CLI" add "Cleanup" --repo app-a >/dev/null
  "$CLI" add "Cleanup" --repo app-b >/dev/null
  cd "$WORK"
  run "$CLI" show cleanup
  [ "$status" -ne 0 ]
  [[ "$output" == *"--repo"* ]]
}

@test "show: unknown project exits 4" {
  "$CLI" add "Search v2" >/dev/null
  run "$CLI" show nope
  [ "$status" -eq 4 ]
}

# ─── edit ───────────────────────────────────────────────────────────────────

@test "edit: sets a description and can clear it" {
  "$CLI" add "Search v2" >/dev/null
  "$CLI" edit 1 --description "make search not embarrassing" >/dev/null
  [ "$(db "SELECT description FROM projects WHERE id=1;")" = "make search not embarrassing" ]

  "$CLI" edit 1 --description "" >/dev/null
  [ "$(db "SELECT coalesce(description,'NULL') FROM projects WHERE id=1;")" = "NULL" ]
}

@test "edit: with no fields is a usage error, not a silent no-op" {
  "$CLI" add "Search v2" >/dev/null
  run "$CLI" edit 1
  [ "$status" -eq 2 ]
}

@test "edit: moving a project to another app takes its tickets with it" {
  # The tickets' repo_slug is a property of the work they belong to. Leaving
  # them behind is exactly the orphaning this whole entity exists to stop.
  "$CLI" add "Search v2" >/dev/null
  "$TICKET" add "index it" --project search-v2 >/dev/null
  "$TICKET" doc 1 --type plan --path "$WORK/p1.md" >/dev/null

  "$CLI" edit 1 --repo other-app >/dev/null
  [ "$(db "SELECT repo_slug FROM projects WHERE id=1;")" = "other-app" ]
  [ "$(db "SELECT repo_slug FROM tickets WHERE id=1;")" = "other-app" ]
  [ "$(db "SELECT repo_slug FROM documents WHERE id=1;")" = "other-app" ]
}

@test "edit: refuses to move a project whose ticket is already started" {
  "$CLI" add "Search v2" >/dev/null
  "$TICKET" add "index it" --project search-v2 >/dev/null
  db "UPDATE tickets SET branch='t1-x', worktree_path='$WORK/wt' WHERE id=1;"

  run "$CLI" edit 1 --repo other-app
  [ "$status" -ne 0 ]
  [[ "$output" == *"started"* ]]
  [ "$(db "SELECT repo_slug FROM projects WHERE id=1;")" = "test-demo" ]
}

# ─── done / rm ──────────────────────────────────────────────────────────────

@test "done: marks it finished without touching its tickets" {
  "$CLI" add "Search v2" >/dev/null
  "$TICKET" add "index it" --project search-v2 >/dev/null
  "$CLI" done 1 >/dev/null
  [ "$(db "SELECT status FROM projects WHERE id=1;")" = "done" ]
  [ "$(db "SELECT status FROM tickets WHERE id=1;")" = "idea" ]
}

@test "rm: deletes the grouping and leaves its tickets loose in the app" {
  "$CLI" add "Search v2" >/dev/null
  "$TICKET" add "index it" --project search-v2 >/dev/null

  run "$CLI" rm 1 --yes
  [ "$status" -eq 0 ]
  [[ "$output" == *"loose"* ]]
  [ "$(db "SELECT count(*) FROM projects;")" = "0" ]
  # The work survives; only the grouping went.
  [ "$(db "SELECT count(*) FROM tickets;")" = "1" ]
  [ "$(db "SELECT coalesce(project_id,'NULL') FROM tickets WHERE id=1;")" = "NULL" ]
  [ "$(db "SELECT repo_slug FROM tickets WHERE id=1;")" = "test-demo" ]
}

@test "rm: refuses without --yes in a non-interactive shell" {
  "$CLI" add "Search v2" >/dev/null
  run "$CLI" rm 1
  [ "$status" -ne 0 ]
  [ "$(db "SELECT count(*) FROM projects;")" = "1" ]
}

@test "rm: unknown project exits 4" {
  "$CLI" add "Search v2" >/dev/null
  run "$CLI" rm 99 --yes
  [ "$status" -eq 4 ]
}

# ─── dispatch ───────────────────────────────────────────────────────────────

@test "no args / --help: prints usage, exits 2" {
  run "$CLI"
  [ "$status" -eq 2 ]
  [[ "$output" == *"usage:"* ]]
}

@test "unknown subcommand: exits 2" {
  run "$CLI" frobnicate
  [ "$status" -eq 2 ]
}
