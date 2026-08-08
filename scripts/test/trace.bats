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

sq() { sqlite3 "$SMRITI_HOME/factory.db" "$1"; }

# Durations are gaps between recorded instants, so a test that lets the wall
# clock supply them can only assert "roughly". Stamping the timestamps after
# the fact makes every assertion exact — and keeps the production code free of
# a clock seam that exists only for tests.
stamp_run() { sq "UPDATE runs SET started_at='$2', ended_at=$3 WHERE run_uid='$1';"; }
stamp_event() { sq "UPDATE events SET at='$3' WHERE run_uid='$1' AND id=(
  SELECT id FROM events WHERE run_uid='$1' ORDER BY id LIMIT 1 OFFSET $2);"; }

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

# ─── durations: agent time vs your time ─────────────────────────────────────
#
# The gate is the whole point: wall clock alone conflates a 4-minute plan with
# a 6-minute gate sitting idle waiting for a human, and hides the one fact that
# says whether the workflow or the agent is the slow part.

# A run with the exact shape /begin produces, timestamped to the second:
#   10:00 start · 10:04 plan ok · 10:05:30 codex ok · 10:06 approve awaiting
#   10:12 implement start · 10:19 implement ok · 10:20 end
# => 20m total, 6m of it yours (10:06 -> 10:12).
gated_run() {
  local uid; uid=$(start_run)
  "$CLI" emit plan ok --run "$uid"
  "$CLI" emit codex ok --run "$uid"
  "$CLI" emit approve awaiting --run "$uid"
  "$CLI" emit implement start --run "$uid"
  "$CLI" emit implement ok --run "$uid"
  "$CLI" end --run "$uid"
  stamp_run "$uid" '2026-08-08T10:00:00Z' "'2026-08-08T10:20:00Z'"
  stamp_event "$uid" 0 '2026-08-08T10:04:00Z'
  stamp_event "$uid" 1 '2026-08-08T10:05:30Z'
  stamp_event "$uid" 2 '2026-08-08T10:06:00Z'
  stamp_event "$uid" 3 '2026-08-08T10:12:00Z'
  stamp_event "$uid" 4 '2026-08-08T10:19:00Z'
  printf '%s' "$uid"
}

@test "list --json: a finished run reports its duration" {
  local uid; uid=$(gated_run)
  run "$CLI" list --json
  [ "$(echo "$output" | jq -r '.[0].duration_s')" = "1200" ]
  [ "$(echo "$output" | jq -r '.[0].last_event_at')" = "2026-08-08T10:19:00Z" ]
}

@test "list --json: an open run's duration grows from its start" {
  local uid; uid=$(start_run)
  stamp_run "$uid" '2026-08-08T10:00:00Z' 'NULL'
  run "$CLI" list --json
  # Measured against now, so only the floor is knowable — but it is enormous,
  # which is exactly what distinguishes "still running" from "took 0s".
  [ "$(echo "$output" | jq -r '.[0].duration_s')" -gt 1000 ]
}

@test "the gate's minutes land in your time, not the agent's" {
  local uid; uid=$(gated_run)
  run "$CLI" list --json
  [ "$(echo "$output" | jq -r '.[0].you_s')" = "360" ]
  [ "$(echo "$output" | jq -r '.[0].agent_s')" = "840" ]
}

@test "agent_s + you_s accounts for the whole run" {
  local uid; uid=$(gated_run)
  run "$CLI" list --json
  echo "$output" | jq -e '.[0] | (.agent_s + .you_s) == .duration_s'
}

@test "a wait followed by 'implement start' is still filed under the gate" {
  # The trap this model exists to avoid: attributing the segment to the event
  # that CLOSES it would blame `implement` for six minutes of a human thinking.
  local uid; uid=$(gated_run)
  run "$CLI" show "$uid" --json
  [ "$(echo "$output" | jq -r '.phases[] | select(.phase=="approve") | .you_s')" = "360" ]
  [ "$(echo "$output" | jq -r '.phases[] | select(.phase=="implement") | .you_s')" = "0" ]
}

@test "show --json: phases roll up in first-seen order with their own totals" {
  local uid; uid=$(gated_run)
  run "$CLI" show "$uid" --json
  [ "$(echo "$output" | jq -r '[.phases[].phase] | join(",")')" = "plan,codex,approve,implement" ]
  [ "$(echo "$output" | jq -r '.phases[] | select(.phase=="plan")  | .total_s')" = "240" ]
  [ "$(echo "$output" | jq -r '.phases[] | select(.phase=="codex") | .total_s')" = "90" ]
  # implement owns both the 7m of work and the last minute before `end`.
  [ "$(echo "$output" | jq -r '.phases[] | select(.phase=="implement") | .total_s')" = "480" ]
  [ "$(echo "$output" | jq -r '.totals.duration_s')" = "1200" ]
}

@test "show --json: each event carries the segment it closed" {
  local uid; uid=$(gated_run)
  run "$CLI" show "$uid" --json
  [ "$(echo "$output" | jq -r '.events[0].elapsed_s')" = "240" ]
  [ "$(echo "$output" | jq -r '.events[0].kind')" = "agent" ]
  # The `implement start` event closes the human wait.
  [ "$(echo "$output" | jq -r '.events[3].kind')" = "you" ]
  [ "$(echo "$output" | jq -r '.events[3].elapsed_s')" = "360" ]
}

@test "show: the plain read renders the breakdown too" {
  local uid; uid=$(gated_run)
  run "$CLI" show "$uid"
  [[ "$output" == *"where the time went"* ]]
  [[ "$output" == *"agent 14m"* ]]
  [[ "$output" == *"you 6m"* ]]
}

@test "a completed run with no events reports its whole duration as agent time" {
  local uid; uid=$(start_run)
  "$CLI" end --run "$uid"
  stamp_run "$uid" '2026-08-08T10:00:00Z' "'2026-08-08T10:05:00Z'"
  run "$CLI" list --json
  [ "$(echo "$output" | jq -r '.[0].duration_s')" = "300" ]
  [ "$(echo "$output" | jq -r '.[0].agent_s')" = "300" ]
  run "$CLI" show "$uid" --json
  [ "$(echo "$output" | jq -r '.phases | length')" = "0" ]
}

@test "the tail from the last event to end is credited to the last phase" {
  local uid; uid=$(start_run)
  "$CLI" emit verify ok --run "$uid"
  "$CLI" end --run "$uid"
  stamp_run "$uid" '2026-08-08T10:00:00Z' "'2026-08-08T10:10:00Z'"
  stamp_event "$uid" 0 '2026-08-08T10:06:00Z'
  run "$CLI" show "$uid" --json
  # 6m to the event + 4m from it to `end`, all of it verify.
  [ "$(echo "$output" | jq -r '.phases[] | select(.phase=="verify") | .total_s')" = "600" ]
}

@test "a phase that comes back merges into one entry, not two" {
  local uid; uid=$(start_run)
  "$CLI" emit plan ok --run "$uid"
  "$CLI" emit review ok --run "$uid"
  "$CLI" emit plan ok --run "$uid"
  "$CLI" end --run "$uid"
  stamp_run "$uid" '2026-08-08T09:00:00Z' "'2026-08-08T09:10:00Z'"
  stamp_event "$uid" 0 '2026-08-08T09:02:00Z'
  stamp_event "$uid" 1 '2026-08-08T09:05:00Z'
  stamp_event "$uid" 2 '2026-08-08T09:08:00Z'
  run "$CLI" show "$uid" --json
  [ "$(echo "$output" | jq -r '[.phases[] | select(.phase=="plan")] | length')" = "1" ]
  # 2m + 3m + the 2m tail to `end`; ordered by where it FIRST appeared.
  [ "$(echo "$output" | jq -r '.phases[] | select(.phase=="plan") | .total_s')" = "420" ]
  [ "$(echo "$output" | jq -r '.phases[0].phase')" = "plan" ]
}

@test "a clock that jumped backwards clamps to zero rather than going negative" {
  local uid; uid=$(start_run)
  "$CLI" emit plan ok --run "$uid"
  "$CLI" end --run "$uid"
  stamp_run "$uid" '2026-08-08T09:00:00Z' "'2026-08-08T08:50:00Z'"
  stamp_event "$uid" 0 '2026-08-08T09:04:00Z'
  run "$CLI" list --json
  [ "$(echo "$output" | jq -r '.[0].duration_s')" = "240" ]
  echo "$output" | jq -e '.[0] | .duration_s >= 0 and .agent_s >= 0 and .you_s >= 0'
  echo "$output" | jq -e '.[0] | (.agent_s + .you_s) == .duration_s'
}

@test "list --ticket: only that ticket's runs" {
  "$FAKE_BIN/smriti-ticket" add "one" >/dev/null
  "$FAKE_BIN/smriti-ticket" add "two" >/dev/null
  "$CLI" start begin --ticket 1 >/dev/null
  "$CLI" start begin --ticket 2 >/dev/null
  run "$CLI" list --ticket 1 --json
  [ "$(echo "$output" | jq -r 'length')" = "1" ]
  [ "$(echo "$output" | jq -r '.[0].ticket_id')" = "1" ]
}

@test "list --limit caps the result" {
  start_run; start_run; start_run
  run "$CLI" list --limit 2 --json
  [ "$(echo "$output" | jq -r 'length')" = "2" ]
}

@test "list --limit and stats --days must be numbers" {
  # These interpolate into SQL, so a non-number is a usage error, never a query.
  start_run
  run "$CLI" list --limit "1; DROP TABLE runs"
  [ "$status" -eq 2 ]
  run "$CLI" stats --days "1 OR 1=1"
  [ "$status" -eq 2 ]
  run "$CLI" list --json
  [ "$(echo "$output" | jq -r 'length')" = "1" ]
}

# ─── stats ──────────────────────────────────────────────────────────────────

# Three completed runs of 20m / 3m / 2m, so the median is unambiguous.
three_runs() {
  gated_run >/dev/null
  local n
  for n in 2 3; do
    local uid; uid=$(start_run)
    "$CLI" emit plan ok --run "$uid"
    "$CLI" emit implement ok --run "$uid"
    "$CLI" end --run "$uid"
    stamp_run "$uid" "2026-08-08T1${n}:00:00Z" "'2026-08-08T1${n}:0${n}:00Z'"
    stamp_event "$uid" 0 "2026-08-08T1${n}:01:00Z"
    stamp_event "$uid" 1 "2026-08-08T1${n}:0${n}:00Z"
  done
}

@test "stats: median duration per skill over an odd number of runs" {
  three_runs
  run "$CLI" stats --days 0 --json
  [ "$(echo "$output" | jq -r '.runs')" = "3" ]
  # 1200, 180, 120 -> 180
  [ "$(echo "$output" | jq -r '.by_skill[] | select(.skill=="begin") | .median_s')" = "180" ]
  [ "$(echo "$output" | jq -r '.by_skill[] | select(.skill=="begin") | .runs')" = "3" ]
}

@test "stats: an even number of runs averages the middle two" {
  local uid; uid=$(start_run)
  "$CLI" emit plan ok --run "$uid"; "$CLI" end --run "$uid"
  stamp_run "$uid" '2026-08-08T14:00:00Z' "'2026-08-08T14:10:00Z'"
  stamp_event "$uid" 0 '2026-08-08T14:05:00Z'
  three_runs
  run "$CLI" stats --days 0 --json
  # 1200, 600, 180, 120 -> (600 + 180) / 2 = 390
  [ "$(echo "$output" | jq -r '.by_skill[0].median_s')" = "390" ]
}

@test "stats: an in-flight run is excluded — it would drag every median down" {
  three_runs
  local open; open=$(start_run)
  stamp_run "$open" '2026-08-08T10:00:00Z' 'NULL'
  run "$CLI" stats --days 0 --json
  [ "$(echo "$output" | jq -r '.runs')" = "3" ]
  [ "$(echo "$output" | jq -r '.by_skill[0].median_s')" = "180" ]
}

@test "stats: a repeated phase counts once per run, not once per event" {
  # Otherwise a chatty phase dominates its own median with its repetitions.
  local uid; uid=$(start_run)
  "$CLI" emit plan ok --run "$uid"
  "$CLI" emit plan ok --run "$uid"
  "$CLI" emit plan ok --run "$uid"
  "$CLI" end --run "$uid"
  stamp_run "$uid" '2026-08-08T09:00:00Z' "'2026-08-08T09:04:00Z'"
  stamp_event "$uid" 0 '2026-08-08T09:01:00Z'
  stamp_event "$uid" 1 '2026-08-08T09:02:00Z'
  stamp_event "$uid" 2 '2026-08-08T09:03:00Z'
  run "$CLI" stats --days 0 --json
  [ "$(echo "$output" | jq -r '.by_phase[] | select(.phase=="plan") | .samples')" = "1" ]
  [ "$(echo "$output" | jq -r '.by_phase[] | select(.phase=="plan") | .median_s')" = "240" ]
}

@test "stats: the gate shows up as your time in the per-phase medians" {
  gated_run >/dev/null
  run "$CLI" stats --days 0 --json
  [ "$(echo "$output" | jq -r '.by_phase[] | select(.phase=="approve") | .median_you_s')" = "360" ]
}

@test "stats: --skill narrows to one skill" {
  three_runs
  local uid; uid=$(start_run debug)
  "$CLI" end --run "$uid"
  stamp_run "$uid" '2026-08-08T15:00:00Z' "'2026-08-08T15:30:00Z'"
  run "$CLI" stats --days 0 --skill debug --json
  [ "$(echo "$output" | jq -r '.runs')" = "1" ]
  [ "$(echo "$output" | jq -r '.by_skill[0].skill')" = "debug" ]
  [ "$(echo "$output" | jq -r '.by_skill[0].median_s')" = "1800" ]
}

@test "stats: --days drops runs older than the window, --days 0 keeps them" {
  # Stamped relative to now rather than to a fixed date, so this stays true
  # whenever it runs.
  local old; old=$(start_run)
  "$CLI" end --run "$old"
  sq "UPDATE runs SET started_at = strftime('%Y-%m-%dT%H:%M:%SZ','now','-40 days'),
                      ended_at   = strftime('%Y-%m-%dT%H:%M:%SZ','now','-40 days','+5 minutes')
      WHERE run_uid='$old';"

  run "$CLI" stats --days 30 --json
  [ "$(echo "$output" | jq -r '.runs')" = "0" ]

  run "$CLI" stats --days 0 --json
  [ "$(echo "$output" | jq -r '.runs')" = "1" ]
  [ "$(echo "$output" | jq -r '.by_skill[0].median_s')" = "300" ]
}

@test "stats: nothing finished yet is a sentence, not an empty table" {
  start_run
  run "$CLI" stats
  [ "$status" -eq 0 ]
  [[ "$output" == *"no completed runs yet"* ]]
}

@test "stats: on an empty store it exits 0 and creates nothing" {
  rm -f "$SMRITI_HOME/factory.db"
  run "$CLI" stats
  [ "$status" -eq 0 ]
  [[ "$output" == *"no completed runs yet"* ]]
  [ ! -f "$SMRITI_HOME/factory.db" ]

  run "$CLI" stats --json
  [ "$status" -eq 0 ]
  [ "$(echo "$output" | jq -r '.runs')" = "0" ]
  [ ! -f "$SMRITI_HOME/factory.db" ]
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
