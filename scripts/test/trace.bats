#!/usr/bin/env bats
# Tests for bin/smriti-trace — the run trace (runs + phase events).
# Run via: bun run test (which shells out to scripts/run-tests.sh)

setup() {
  ROOT="$BATS_TEST_DIRNAME/../.."
  WORK=$(mktemp -d)

  FAKE_BIN="$WORK/fake-bin"
  REPO="$WORK/repo"
  mkdir -p "$FAKE_BIN" "$REPO"
  ln -s "$ROOT/bin/smriti-trace"  "$FAKE_BIN/smriti-trace"
  ln -s "$ROOT/bin/smriti-ticket" "$FAKE_BIN/smriti-ticket"
  ln -s "$ROOT/bin/smriti-slug"   "$FAKE_BIN/smriti-slug"
  CLI="$FAKE_BIN/smriti-trace"

  export SMRITI_HOME="$WORK/state"
  mkdir -p "$SMRITI_HOME"

  ORIG_PATH="$PATH"
  PATH="$FAKE_BIN:$PATH"

  cd "$REPO"
  git init -q -b main
  git config user.email "test@smriti.local"
  git config user.name "smriti-test"
  git remote add origin "https://github.com/test/demo.git"
  echo seed > f && git add f && git commit -q -m init
}

teardown() {
  PATH="$ORIG_PATH"
  cd /
  rm -rf "$WORK"
}

start_run() {
  local out; out=$("$CLI" start "${1:-begin}")
  printf '%s' "$out" | cut -d= -f2-
}

# ─── run lifecycle ──────────────────────────────────────────────────────────

@test "start: prints a sourceable RUN_UID" {
  run "$CLI" start begin
  [ "$status" -eq 0 ]
  [[ "$output" == RUN_UID=* ]]
  eval "$output"
  [ -n "$RUN_UID" ]
}

@test "start: two runs get distinct ids" {
  local a b
  a=$(start_run); b=$(start_run)
  [ "$a" != "$b" ]
}

@test "emit: records phases in order and show renders them" {
  local uid; uid=$(start_run)
  "$CLI" emit ground ok --run "$uid"
  "$CLI" emit plan ok --run "$uid" --note "wrote the plan"

  run "$CLI" show "$uid"
  [ "$status" -eq 0 ]
  [[ "$output" == *"ground"* ]]
  [[ "$output" == *"wrote the plan"* ]]
}

@test "emit: resolves the current run without --run" {
  # Skills are a sequential flow, so 'the run I am inside' must not need a uid
  # threaded through every step of a markdown prompt.
  local uid; uid=$(start_run)
  run "$CLI" emit ground ok
  [ "$status" -eq 0 ]

  run "$CLI" show "$uid"
  [[ "$output" == *"ground"* ]]
}

@test "emit: with no run at all is a clear error, not a silent success" {
  run "$CLI" emit ground ok
  [ "$status" -eq 4 ]
  [[ "$output" == *"no active run"* ]]
}

@test "emit: rejects an unknown event status" {
  start_run
  run "$CLI" emit ground bogus
  [ "$status" -eq 2 ]
  [[ "$output" == *"invalid status"* ]]
}

@test "emit awaiting: flips the run to awaiting, a later event flips it back" {
  # This is what puts a run under 'waiting on you' in the factory view.
  local uid; uid=$(start_run)
  "$CLI" emit approve awaiting --run "$uid"
  run "$CLI" list --active
  [[ "$output" == *"awaiting"* ]]

  "$CLI" emit implement start --run "$uid"
  run "$CLI" list --active
  [[ "$output" == *"running"* ]]
  ! [[ "$output" == *"awaiting"* ]]
}

@test "end: closes the run and drops it from --active" {
  local uid; uid=$(start_run)
  "$CLI" end --run "$uid"

  run "$CLI" list --active
  [[ "$output" == *"no runs recorded yet"* ]] || ! [[ "$output" == *"$uid"* ]]

  run "$CLI" show "$uid"
  [[ "$output" == *"done"* ]]
}

@test "end: --status failed is recorded" {
  local uid; uid=$(start_run)
  "$CLI" end --run "$uid" --status failed
  run "$CLI" show "$uid"
  [[ "$output" == *"failed"* ]]
}

@test "end: with nothing open exits 0 rather than erroring" {
  # Tracing must never be able to fail the work it traces, so ending twice or
  # ending nothing is a no-op.
  run "$CLI" end
  [ "$status" -eq 0 ]
}

# ─── the cursor ─────────────────────────────────────────────────────────────

@test "tail: --after acts as a cursor, returning only newer events" {
  local uid; uid=$(start_run)
  "$CLI" emit one ok --run "$uid"
  "$CLI" emit two ok --run "$uid"

  run "$CLI" tail --after 0
  [[ "$output" == *"one"* ]]
  [[ "$output" == *"two"* ]]

  run "$CLI" tail --after 1
  ! [[ "$output" == *"one"* ]]
  [[ "$output" == *"two"* ]]
}

@test "tail: --after past the end returns nothing, exits 0" {
  local uid; uid=$(start_run)
  "$CLI" emit one ok --run "$uid"
  run "$CLI" tail --after 9999
  [ "$status" -eq 0 ]
  [ -z "$output" ]
}

@test "tail: --after must be a number" {
  run "$CLI" tail --after "1; DROP TABLE events"
  [ "$status" -eq 2 ]
}

# ─── linking + json ─────────────────────────────────────────────────────────

@test "start: --ticket links the run to a ticket" {
  "$FAKE_BIN/smriti-ticket" add "Export to CSV" >/dev/null
  local out uid
  out=$("$CLI" start begin --ticket 1)
  uid=$(printf '%s' "$out" | cut -d= -f2-)

  run "$CLI" show "$uid"
  [[ "$output" == *"#1"* ]]
}

@test "list --json: exposes the fields the factory view renders" {
  local uid; uid=$(start_run)
  "$CLI" emit plan ok --run "$uid"

  run "$CLI" list --json
  [ "$status" -eq 0 ]
  echo "$output" | jq -e '.[0] | .run_uid and .skill and .status'
  [ "$(echo "$output" | jq -r '.[0].last_phase')" = "plan" ]
}

@test "show --json: run plus its events in one object" {
  local uid; uid=$(start_run)
  "$CLI" emit plan ok --run "$uid"
  run "$CLI" show "$uid" --json
  [ "$(echo "$output" | jq -r '.run.run_uid')" = "$uid" ]
  [ "$(echo "$output" | jq -r '.events | length')" = "1" ]
}

@test "deleting a ticket leaves its runs intact with a null ticket" {
  "$FAKE_BIN/smriti-ticket" add "x" >/dev/null
  local out uid
  out=$("$CLI" start begin --ticket 1)
  uid=$(printf '%s' "$out" | cut -d= -f2-)
  sqlite3 "$SMRITI_HOME/factory.db" ".timeout 5000" "PRAGMA foreign_keys=ON;" "DELETE FROM tickets WHERE id=1;"

  run "$CLI" show "$uid"
  [ "$status" -eq 0 ]
  [[ "$output" == *"—"* ]]
}

# ─── usage ──────────────────────────────────────────────────────────────────

@test "no args / --help: prints usage, exits 2" {
  run "$CLI"
  [ "$status" -eq 2 ]
  [[ "$output" == *"usage:"* ]]
}

@test "unknown subcommand: exits 2" {
  run "$CLI" bogus
  [ "$status" -eq 2 ]
}

@test "show: unknown run exits 4" {
  run "$CLI" show deadbeef
  [ "$status" -eq 4 ]
}

@test "reads and failed emits never bring the store into being" {
  # Skills call `emit` with `|| true` on every step, so a store materialising
  # as a side effect of a failed call would be invisible.
  rm -f "$SMRITI_HOME/factory.db"

  run "$CLI" emit ground ok
  [ "$status" -eq 4 ]
  [ ! -f "$SMRITI_HOME/factory.db" ]

  run "$CLI" list --active
  [ "$status" -eq 0 ]
  [ ! -f "$SMRITI_HOME/factory.db" ]

  run "$CLI" end
  [ "$status" -eq 0 ]
  [ ! -f "$SMRITI_HOME/factory.db" ]
}
