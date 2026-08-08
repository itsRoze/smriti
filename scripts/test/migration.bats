#!/usr/bin/env bats
# Tests for the v1 → v2 migration in lib/factory-db.sh.
#
# v1 called a column project_slug that always held a REPOSITORY. v2 renames it
# to repo_slug, makes it nullable, and adds project_id beside it. SQLite can do
# neither in place, so this is a table rebuild — the one piece of smriti that
# destroys and recreates tables holding real work. It gets its own file.
#
# Run via: bun run test (which shells out to scripts/run-tests.sh)

setup() {
  ROOT="$BATS_TEST_DIRNAME/../.."
  WORK=$(mktemp -d)

  FAKE_BIN="$WORK/fake-bin"
  REPO="$WORK/repo"
  mkdir -p "$FAKE_BIN" "$REPO"
  ln -s "$ROOT/bin/smriti-ticket"  "$FAKE_BIN/smriti-ticket"
  ln -s "$ROOT/bin/smriti-project" "$FAKE_BIN/smriti-project"
  ln -s "$ROOT/bin/smriti-repo"    "$FAKE_BIN/smriti-repo"
  ln -s "$ROOT/bin/smriti-trace"   "$FAKE_BIN/smriti-trace"
  ln -s "$ROOT/bin/smriti-slug"    "$FAKE_BIN/smriti-slug"
  TICKET="$FAKE_BIN/smriti-ticket"
  TRACE="$FAKE_BIN/smriti-trace"

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

# A database at the OLD shape, with a row in every table that carries data.
# Written by hand rather than by an old binary: the point is to pin the shape
# that shipped, so this stays a valid fixture after the old code is gone.
seed_v1() {
  sqlite3 "$SMRITI_HOME/factory.db" "
    PRAGMA journal_mode=WAL;
    CREATE TABLE tickets (
      id INTEGER PRIMARY KEY, project_slug TEXT NOT NULL, title TEXT NOT NULL, body TEXT,
      status TEXT NOT NULL DEFAULT 'idea', priority INTEGER NOT NULL DEFAULT 0,
      branch TEXT, worktree_path TEXT, pr_url TEXT,
      origin TEXT NOT NULL DEFAULT 'local', origin_ref TEXT,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE documents (
      id INTEGER PRIMARY KEY, ticket_id INTEGER REFERENCES tickets(id) ON DELETE SET NULL,
      project_slug TEXT NOT NULL, type TEXT NOT NULL, path TEXT NOT NULL UNIQUE,
      branch TEXT, created_at TEXT NOT NULL);
    CREATE TABLE runs (
      id INTEGER PRIMARY KEY, run_uid TEXT NOT NULL UNIQUE,
      ticket_id INTEGER REFERENCES tickets(id) ON DELETE SET NULL,
      project_slug TEXT NOT NULL, skill TEXT NOT NULL, branch TEXT,
      status TEXT NOT NULL, started_at TEXT NOT NULL, ended_at TEXT);
    CREATE TABLE events (
      id INTEGER PRIMARY KEY, run_uid TEXT NOT NULL REFERENCES runs(run_uid) ON DELETE CASCADE,
      phase TEXT NOT NULL, status TEXT NOT NULL, note TEXT, at TEXT NOT NULL);
    CREATE UNIQUE INDEX tickets_active_branch ON tickets (project_slug, branch) WHERE branch IS NOT NULL;
    CREATE INDEX tickets_by_project ON tickets (project_slug, status);

    INSERT INTO tickets (id, project_slug, title, body, status, priority, branch, worktree_path, created_at, updated_at)
      VALUES (1,'test-demo','Export to CSV','the body','in_progress',3,'t1-export','/tmp/wt','2026-01-01T00:00:00Z','2026-01-02T00:00:00Z'),
             (2,'other-app','Dark mode',NULL,'idea',0,NULL,NULL,'2026-01-01T00:00:00Z','2026-01-01T00:00:00Z');
    INSERT INTO documents (id, ticket_id, project_slug, type, path, branch, created_at)
      VALUES (1,1,'test-demo','plan','/tmp/a-plan-1.md','t1-export','2026-01-01T00:00:00Z');
    INSERT INTO runs (id, run_uid, ticket_id, project_slug, skill, branch, status, started_at)
      VALUES (1,'abc123',1,'test-demo','begin','t1-export','running','2026-01-01T00:00:00Z');
    INSERT INTO events (id, run_uid, phase, status, note, at)
      VALUES (1,'abc123','plan','ok',NULL,'2026-01-01T00:00:00Z'),
             (2,'abc123','codex','ok',NULL,'2026-01-01T00:01:00Z');
  "
}

# Any db-touching verb triggers the migration; `list` is the cheapest.
migrate() { "$TICKET" list --all >/dev/null; }

@test "migration: an old database is reshaped, losing nothing" {
  seed_v1
  migrate

  [ "$(db "SELECT count(*) FROM tickets;")" = "2" ]
  [ "$(db "SELECT count(*) FROM documents;")" = "1" ]
  [ "$(db "SELECT count(*) FROM runs;")" = "1" ]
  # events must survive the runs rebuild: foreign_keys stays OFF during it
  # precisely so DROP TABLE runs cannot cascade them away.
  [ "$(db "SELECT count(*) FROM events;")" = "2" ]
}

@test "migration: project_slug becomes repo_slug, values intact" {
  seed_v1
  migrate

  [ "$(db "SELECT count(*) FROM pragma_table_info('tickets') WHERE name='project_slug';")" = "0" ]
  [ "$(db "SELECT count(*) FROM pragma_table_info('tickets') WHERE name='repo_slug';")" = "1" ]
  [ "$(db "SELECT count(*) FROM pragma_table_info('tickets') WHERE name='project_id';")" = "1" ]

  [ "$(db "SELECT repo_slug FROM tickets WHERE id=1;")" = "test-demo" ]
  [ "$(db "SELECT repo_slug FROM tickets WHERE id=2;")" = "other-app" ]
  [ "$(db "SELECT repo_slug FROM documents WHERE id=1;")" = "test-demo" ]
  [ "$(db "SELECT repo_slug FROM runs WHERE id=1;")" = "test-demo" ]
}

@test "migration: every other column survives the rebuild" {
  seed_v1
  migrate

  [ "$(db "SELECT title FROM tickets WHERE id=1;")" = "Export to CSV" ]
  [ "$(db "SELECT body FROM tickets WHERE id=1;")" = "the body" ]
  [ "$(db "SELECT status FROM tickets WHERE id=1;")" = "in_progress" ]
  [ "$(db "SELECT priority FROM tickets WHERE id=1;")" = "3" ]
  [ "$(db "SELECT branch FROM tickets WHERE id=1;")" = "t1-export" ]
  [ "$(db "SELECT worktree_path FROM tickets WHERE id=1;")" = "/tmp/wt" ]
  [ "$(db "SELECT created_at FROM tickets WHERE id=1;")" = "2026-01-01T00:00:00Z" ]
  [ "$(db "SELECT path FROM documents WHERE id=1;")" = "/tmp/a-plan-1.md" ]
  [ "$(db "SELECT run_uid FROM runs WHERE id=1;")" = "abc123" ]
}

@test "migration: every distinct old slug becomes a repositories row" {
  seed_v1
  migrate
  [ "$(db "SELECT count(*) FROM repositories;")" = "2" ]
  [ "$(db "SELECT group_concat(slug, ',') FROM (SELECT slug FROM repositories ORDER BY slug);")" = "other-app,test-demo" ]
}

@test "migration: invents no projects — old tickets are loose in their app" {
  # "This ticket is not part of any project" is a legitimate state in the new
  # model, so inventing a project per app would be fabricating structure.
  seed_v1
  migrate
  [ "$(db "SELECT count(*) FROM projects;")" = "0" ]
  [ "$(db "SELECT count(*) FROM tickets WHERE project_id IS NOT NULL;")" = "0" ]
}

@test "migration: runs twice with no effect" {
  seed_v1
  migrate
  local before; before=$(db "SELECT count(*) FROM tickets;")
  rm -f "$SMRITI_HOME/.factory-schema-v2"   # force the guard to be consulted
  migrate
  [ "$(db "SELECT count(*) FROM tickets;")" = "$before" ]
  [ "$(db "SELECT count(*) FROM repositories;")" = "2" ]
  [ "$(db "SELECT count(*) FROM tickets WHERE repo_slug='test-demo';")" = "1" ]
}

@test "migration: leaves the database referentially sound" {
  seed_v1
  migrate
  run sqlite3 "$SMRITI_HOME/factory.db" "PRAGMA foreign_key_check;"
  [ "$status" -eq 0 ]
  [ -z "$output" ]
  # The rebuilt tables must reference the real tables, not the scratch _v2
  # names they were built under — that is what legacy_alter_table guards.
  run sqlite3 "$SMRITI_HOME/factory.db" "SELECT sql FROM sqlite_master WHERE name='documents';"
  [[ "$output" == *"REFERENCES tickets(id)"* ]]
  ! [[ "$output" == *"_v2"* ]]
}

@test "migration: the indexes come back" {
  seed_v1
  migrate
  run sqlite3 "$SMRITI_HOME/factory.db" \
    "SELECT name FROM sqlite_master WHERE type='index' AND name IN
     ('tickets_active_branch','tickets_worktree','tickets_by_repo','projects_slug');"
  [[ "$output" == *"tickets_active_branch"* ]]
  [[ "$output" == *"tickets_worktree"* ]]
  [[ "$output" == *"tickets_by_repo"* ]]
  [[ "$output" == *"projects_slug"* ]]
}

@test "migration: a migrated store is fully usable afterwards" {
  seed_v1
  migrate

  # The whole point: new verbs work on old data.
  run "$FAKE_BIN/smriti-project" add "Search v2"
  [ "$status" -eq 0 ]
  run "$TICKET" edit 2 --project search-v2 --repo test-demo
  [ "$status" -eq 0 ]
  [ "$(db "SELECT project_id FROM tickets WHERE id=2;")" = "1" ]

  run "$TICKET" list --all --json
  [ "$status" -eq 0 ]
  echo "$output" | jq -e '.[0] | has("repo_slug") and has("project_id")'
}

@test "migration: a fresh database is born at the new shape, unmigrated" {
  # No seed. A write, not a read: reads deliberately refuse to bring the store
  # into being just to answer "nothing here".
  "$TICKET" add "first" >/dev/null
  [ "$(db "SELECT count(*) FROM pragma_table_info('tickets') WHERE name='repo_slug';")" = "1" ]
  [ "$(db "SELECT count(*) FROM pragma_table_info('tickets') WHERE name='project_slug';")" = "0" ]
  [ -f "$SMRITI_HOME/.factory-schema-v2" ]
}

@test "migration: the marker keeps steady state off the migration path" {
  seed_v1
  migrate
  [ -f "$SMRITI_HOME/.factory-schema-v2" ]
  # With the marker present the guard is never even consulted, which is what
  # keeps the cost of every smriti command at one file test.
  db "ALTER TABLE tickets ADD COLUMN canary TEXT;"
  migrate
  [ "$(db "SELECT count(*) FROM pragma_table_info('tickets') WHERE name='canary';")" = "1" ]
}

@test "migration: a v1 store with an empty project_slug lands as no app" {
  seed_v1
  db "UPDATE tickets SET project_slug='' WHERE id=2;"
  migrate
  [ "$(db "SELECT coalesce(repo_slug,'NULL') FROM tickets WHERE id=2;")" = "NULL" ]
  # ...and does not become a phantom repository named ''.
  [ "$(db "SELECT count(*) FROM repositories WHERE slug='';")" = "0" ]
}
