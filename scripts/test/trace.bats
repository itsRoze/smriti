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
  # ended_at precedes started_at, so the run's wall clock is negative. Every
  # segment clamps and the total collapses to 0 — never a negative number, and
  # never more than the wall clock it is supposed to describe.
  local uid; uid=$(start_run)
  "$CLI" emit plan ok --run "$uid"
  "$CLI" end --run "$uid"
  stamp_run "$uid" '2026-08-08T09:00:00Z' "'2026-08-08T08:50:00Z'"
  stamp_event "$uid" 0 '2026-08-08T09:04:00Z'
  run "$CLI" list --json
  [ "$(echo "$output" | jq -r '.[0].duration_s')" = "0" ]
  echo "$output" | jq -e '.[0] | .duration_s >= 0 and .agent_s >= 0 and .you_s >= 0'
  echo "$output" | jq -e '.[0] | (.agent_s + .you_s) == .duration_s'
}

@test "an emit that lands after end cannot push the total past the wall clock" {
  # Every trace verb is best-effort and `end` is its own step, so a late emit is
  # a real sequence. Uncorrected it opened a segment running past ended_at, and
  # the parts summed to more than the whole.
  local uid; uid=$(start_run)
  "$CLI" emit plan ok --run "$uid"
  "$CLI" end --run "$uid"
  "$CLI" emit review ok --run "$uid"      # arrives after the run was closed
  stamp_run "$uid" '2026-08-08T10:00:00Z' "'2026-08-08T10:10:00Z'"
  stamp_event "$uid" 0 '2026-08-08T10:04:00Z'
  stamp_event "$uid" 1 '2026-08-08T10:30:00Z'

  run "$CLI" list --json
  [ "$(echo "$output" | jq -r '.[0].duration_s')" = "600" ]   # exactly the wall clock
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

# A completed run with an exact agent/you split, built from second offsets:
#   start ─agent→ plan ok ─0→ approve awaiting ─you→ approve ok ─0→ end
split_run() {
  local agent="$1" you="$2" base="$3" uid
  uid=$(start_run)
  "$CLI" emit plan ok --run "$uid"
  "$CLI" emit approve awaiting --run "$uid"
  "$CLI" emit approve ok --run "$uid"
  "$CLI" end --run "$uid"
  local at_plan at_gate at_done
  at_plan=$(sq "SELECT strftime('%Y-%m-%dT%H:%M:%SZ','$base','+$agent seconds');")
  at_gate="$at_plan"
  at_done=$(sq "SELECT strftime('%Y-%m-%dT%H:%M:%SZ','$base','+$((agent + you)) seconds');")
  stamp_run "$uid" "$base" "'$at_done'"
  stamp_event "$uid" 0 "$at_plan"
  stamp_event "$uid" 1 "$at_gate"
  stamp_event "$uid" 2 "$at_done"
  printf '%s' "$uid"
}

@test "stats: the three medians reconcile — agent + you == total" {
  # Ranking each column separately gives three medians of three DIFFERENT runs,
  # and median(total) is not median(agent) + median(you) — so the table printed
  # three numbers that invited a reader to hunt for time that was never missing.
  split_run 100 0  '2026-08-08T01:00:00Z' >/dev/null
  split_run 0   100 '2026-08-08T02:00:00Z' >/dev/null
  split_run 60  60  '2026-08-08T03:00:00Z' >/dev/null

  run "$CLI" stats --days 0 --json
  [ "$(echo "$output" | jq -r '.runs')" = "3" ]
  echo "$output" | jq -e '.by_skill[0] | (.median_agent_s + .median_you_s) == .median_s'
  echo "$output" | jq -e 'all(.by_phase[]; (.median_agent_s + .median_you_s) == .median_s)'
  # Totals are 100, 100, 120 -> median 100, taken from a run that really is
  # 100 seconds, so the split reported is that run's own split.
  [ "$(echo "$output" | jq -r '.by_skill[0].median_s')" = "100" ]
}

@test "a phase name containing a pipe does not corrupt the plain-text columns" {
  # `phase` is free text and sqlite's list mode separates on '|', so splitting on
  # it reported not just a truncated label but the wrong seconds beside it.
  local uid; uid=$(start_run)
  "$CLI" emit 'a|b' ok --run "$uid"
  "$CLI" emit approve awaiting --run "$uid"
  "$CLI" emit approve ok --run "$uid"
  "$CLI" end --run "$uid"
  stamp_run "$uid" '2026-08-08T10:00:00Z' "'2026-08-08T10:10:00Z'"
  stamp_event "$uid" 0 '2026-08-08T10:04:00Z'
  stamp_event "$uid" 1 '2026-08-08T10:05:00Z'
  stamp_event "$uid" 2 '2026-08-08T10:09:00Z'

  run "$CLI" show "$uid"
  [[ "$output" == *"a|b"* ]]
  # 4m of agent work under the pipe-named phase, and it must NOT be reported as
  # your time — the 4m gate belongs to approve.
  [[ "$output" == *"a|b            4m"* ]]
  ! [[ "$output" == *"a              "* ]]

  run "$CLI" stats --days 0
  [[ "$output" == *"a|b"* ]]
}

@test "an out-of-range --days or --limit is a usage error, not silently ignored" {
  # Digits alone are not an integer to `[ -gt ]` or to SQL. The failing test was
  # the left arm of an && list, so set -e did not fire: the window filter was
  # dropped and stats answered over all time under a bogus label.
  start_run
  run "$CLI" stats --days 99999999999999999999 --json
  [ "$status" -eq 2 ]
  [[ "$output" == *"out of range"* ]]

  run "$CLI" list --limit 99999999999999999999 --json
  [ "$status" -eq 2 ]
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

# ─── the html-session join (T8) ─────────────────────────────────────────────
#
# The column carries the `smriti html` session a run's CURRENT gate is served
# on, so the board can click a "waiting on you" row through to the live review.
# Written by smriti-html rather than by a skill — these tests exercise the
# primitive underneath that.

@test "html-session: --html-session records the session and list --json exposes it" {
  local uid; uid=$(start_run)
  "$CLI" emit approve awaiting --run "$uid" --html-session sess-abc123
  run "$CLI" list --json
  [ "$status" -eq 0 ]
  echo "$output" | jq -e '.[0].html_session == "sess-abc123"'
  echo "$output" | jq -e '.[0].status == "awaiting"'
}

@test "html-session: every emit rewrites it, so closing a gate clears the link" {
  local uid; uid=$(start_run)
  "$CLI" emit approve awaiting --run "$uid" --html-session sess-abc123
  "$CLI" emit approve ok --run "$uid"
  run "$CLI" list --json
  echo "$output" | jq -e '.[0].html_session == null'
  echo "$output" | jq -e '.[0].status == "running"'
}

@test "html-session: an emit with no flag clears it — the column is the latest event" {
  local uid; uid=$(start_run)
  "$CLI" emit approve awaiting --run "$uid" --html-session sess-abc123
  "$CLI" emit implement start --run "$uid"
  run "$CLI" list --json
  echo "$output" | jq -e '.[0].html_session == null'
}

@test "html-session: end clears it — a finished run has no gate to click into" {
  local uid; uid=$(start_run)
  "$CLI" emit approve awaiting --run "$uid" --html-session sess-abc123
  "$CLI" end --run "$uid"
  run "$CLI" list --json
  echo "$output" | jq -e '.[0].html_session == null'
}

@test "html-session: an emit after end cannot re-hang a link on a finished run" {
  # `trace` tolerates a late emit by design — the event still records. Without
  # the html_session write riding inside the SAME guarded UPDATE as the status,
  # such an emit would put a live-looking link on a run that is already over.
  local uid; uid=$(start_run)
  "$CLI" end --run "$uid"
  "$CLI" emit approve awaiting --run "$uid" --html-session sess-zombie
  run "$CLI" list --json
  echo "$output" | jq -e '.[0].html_session == null'
  echo "$output" | jq -e '.[0].status == "done"'
}

@test "if-html-session: a matching id closes the gate" {
  local uid; uid=$(start_run)
  "$CLI" emit approve awaiting --run "$uid" --html-session sess-match
  "$CLI" emit approve ok --run "$uid" --if-html-session sess-match
  run "$CLI" list --json
  echo "$output" | jq -e '.[0].status == "running"'
  echo "$output" | jq -e '.[0].html_session == null'
}

@test "if-html-session: a non-matching id writes NOTHING — not even an event" {
  # A no-op has to leave no trace at all. Guarding only the run update would
  # still record a phantom "the gate closed" event on a gate that is still open.
  local uid; uid=$(start_run)
  "$CLI" emit approve awaiting --run "$uid" --html-session sess-mine
  local before; before=$("$CLI" tail --run "$uid" --after 0 | wc -l | tr -d ' ')
  "$CLI" emit approve ok --run "$uid" --if-html-session sess-someone-else
  local after; after=$("$CLI" tail --run "$uid" --after 0 | wc -l | tr -d ' ')
  [ "$before" = "$after" ]
  run "$CLI" list --json
  echo "$output" | jq -e '.[0].status == "awaiting"'
  echo "$output" | jq -e '.[0].html_session == "sess-mine"'
}

@test "if-html-session: closing twice is idempotent — await and stop can both call it" {
  local uid; uid=$(start_run)
  "$CLI" emit approve awaiting --run "$uid" --html-session sess-once
  "$CLI" emit approve ok --run "$uid" --if-html-session sess-once
  local after_first; after_first=$("$CLI" tail --run "$uid" --after 0 | wc -l | tr -d ' ')
  "$CLI" emit approve ok --run "$uid" --if-html-session sess-once
  local after_second; after_second=$("$CLI" tail --run "$uid" --after 0 | wc -l | tr -d ' ')
  [ "$after_first" = "$after_second" ]
}

@test "if-html-session: a stale stop cannot close the gate a newer serve opened" {
  local uid; uid=$(start_run)
  "$CLI" emit approve awaiting --run "$uid" --html-session sess-old
  "$CLI" emit approve ok      --run "$uid" --if-html-session sess-old
  "$CLI" emit approve awaiting --run "$uid" --html-session sess-new
  "$CLI" emit approve ok      --run "$uid" --if-html-session sess-old   # the late stop
  run "$CLI" list --json
  echo "$output" | jq -e '.[0].status == "awaiting"'
  echo "$output" | jq -e '.[0].html_session == "sess-new"'
}

@test "html-session: --html-session and --if-html-session require values" {
  local uid; uid=$(start_run)
  run "$CLI" emit approve ok --run "$uid" --html-session
  [ "$status" -ne 0 ]
  run "$CLI" emit approve ok --run "$uid" --if-html-session
  [ "$status" -ne 0 ]
}

# ── report / artifacts ──────────────────────────────────────────────────────
#
# A report is the one write in this file that is NOT best-effort. Everything
# else here observes the work; a report IS the work, and the board treats a
# stored one as licence to close the pane the summary was printed in.

@test "report: stores the run's closing summary" {
  uid=$(start_run)
  printf 'built: a thing\nreview: clean\n' | "$CLI" report >/dev/null
  [ "$(sq "SELECT count(*) FROM run_artifacts WHERE run_uid='$uid' AND kind='report';")" = "1" ]
  [ "$(sq "SELECT source FROM run_artifacts WHERE run_uid='$uid';")" = "run" ]
}

@test "report: echoes the body to stdout as well as storing it" {
  # Printing is not a convenience. If the store fails the text has at least been
  # rendered into the pane, where a scrape can still recover it — losing both
  # copies at once is the one outcome this feature exists to prevent.
  start_run >/dev/null
  run bash -c "printf 'built: a thing\n' | '$CLI' report"
  [ "$status" -eq 0 ]
  [[ "$output" == *"built: a thing"* ]]
}

@test "report: prints the body even when the store fails, and still fails" {
  start_run >/dev/null
  chmod 000 "$SMRITI_HOME/factory.db"
  run bash -c "printf 'built: a thing\n' | '$CLI' report"
  chmod 644 "$SMRITI_HOME/factory.db"
  [ "$status" -ne 0 ]
  [[ "$output" == *"built: a thing"* ]]
}

@test "report: a second write replaces rather than stacks" {
  uid=$(start_run)
  printf 'first\n'  | "$CLI" report >/dev/null
  printf 'second\n' | "$CLI" report >/dev/null
  [ "$(sq "SELECT count(*) FROM run_artifacts WHERE run_uid='$uid';")" = "1" ]
  [ "$(sq "SELECT body FROM run_artifacts WHERE run_uid='$uid';")" = "second" ]
}

@test "report: newlines, quotes and unicode survive the round trip" {
  uid=$(start_run)
  printf "it's a 'quoted' line; with a semicolon\nand ✅ unicode\n" | "$CLI" report >/dev/null
  [ "$(sq "SELECT body FROM run_artifacts WHERE run_uid='$uid';" | wc -l | tr -d ' ')" = "2" ]
  [[ "$(sq "SELECT body FROM run_artifacts WHERE run_uid='$uid';")" == *"'quoted'"* ]]
  [[ "$(sq "SELECT body FROM run_artifacts WHERE run_uid='$uid';")" == *"✅ unicode"* ]]
}

@test "report: still finds its run AFTER end, not only before" {
  # implicit_run() only sees running/awaiting, so reusing it here would make the
  # ORDER of two lines in a markdown prompt decide whether the report is stored
  # at all — and a silently dropped report means a pane closed with nothing kept.
  uid=$(start_run)
  "$CLI" end
  printf 'written after end\n' | "$CLI" report >/dev/null
  [ "$(sq "SELECT body FROM run_artifacts WHERE run_uid='$uid';")" = "written after end" ]
}

@test "report: with no run on this branch it fails loudly" {
  # A store that exists but holds no run for this branch: exit 4, the same code
  # every other "no such run" in this file uses. Silence here would be a report
  # that went nowhere while the caller believed it was safe to close the pane.
  "$FAKE_BIN/smriti-ticket" add "makes the store exist" >/dev/null
  run bash -c "printf 'orphan\n' | '$CLI' report"
  [ "$status" -eq 4 ]
}

@test "report: with no store at all it fails too, rather than inventing one" {
  run bash -c "printf 'orphan\n' | '$CLI' report"
  [ "$status" -eq 3 ]
  [ ! -f "$SMRITI_HOME/factory.db" ]
}

@test "report: --source must be run or pane" {
  start_run >/dev/null
  run bash -c "printf 'x\n' | '$CLI' report --source guesswork"
  [ "$status" -eq 2 ]
}

@test "report: a scrape is recorded as a scrape" {
  uid=$(start_run)
  printf 'scraped text\n' | "$CLI" report --source pane >/dev/null
  [ "$(sq "SELECT source FROM run_artifacts WHERE run_uid='$uid';")" = "pane" ]
}

@test "start: stamps the herdr pane from the environment" {
  HERDR_PANE_ID="w7:p3" uid=$(HERDR_PANE_ID="w7:p3" "$CLI" start begin | cut -d= -f2-)
  [ "$(sq "SELECT herdr_pane FROM runs WHERE run_uid='$uid';")" = "w7:p3" ]
}

@test "start: a run outside herdr simply has no pane" {
  uid=$(env -u HERDR_PANE_ID "$CLI" start begin | cut -d= -f2-)
  [ "$(sq "SELECT coalesce(herdr_pane,'NULL') FROM runs WHERE run_uid='$uid';")" = "NULL" ]
}

@test "list --json: carries the stamped pane, for the board to match on" {
  HERDR_PANE_ID="w9:p1" "$CLI" start begin >/dev/null
  run "$CLI" list --json
  [ "$status" -eq 0 ]
  [[ "$output" == *'"herdr_pane":"w9:p1"'* ]]
}

@test "artifacts --json: reads back with the pane that produced it" {
  uid=$(HERDR_PANE_ID="w4:p2" "$CLI" start begin | cut -d= -f2-)
  printf 'body here\n' | "$CLI" report --status ok >/dev/null
  run "$CLI" artifacts --run "$uid" --json
  [ "$status" -eq 0 ]
  [[ "$output" == *'"kind":"report"'* ]]
  [[ "$output" == *'"herdr_pane":"w4:p2"'* ]]
  [[ "$output" == *'"status":"ok"'* ]]
}

@test "artifacts: on an empty store it answers [] and creates nothing" {
  rm -rf "$SMRITI_HOME"; mkdir -p "$SMRITI_HOME"
  run "$CLI" artifacts --json
  [ "$status" -eq 0 ]
  [ "$output" = "[]" ]
  [ ! -f "$SMRITI_HOME/factory.db" ]
}

@test "artifacts --ticket: only that ticket's artifacts" {
  "$FAKE_BIN/smriti-ticket" add "one" >/dev/null
  "$FAKE_BIN/smriti-ticket" add "two" >/dev/null
  u1=$("$CLI" start begin --ticket 1 | cut -d= -f2-)
  printf 'for one\n' | "$CLI" report --run "$u1" >/dev/null
  u2=$("$CLI" start begin --ticket 2 | cut -d= -f2-)
  printf 'for two\n' | "$CLI" report --run "$u2" >/dev/null
  run "$CLI" artifacts --ticket 1 --json
  [[ "$output" == *"for one"* ]]
  [[ "$output" != *"for two"* ]]
}

@test "report: an empty body is refused, not stored" {
  # Worse than no report: the board treats a stored one as licence to close the
  # pane, so an empty row would close a session having kept nothing.
  uid=$(start_run)
  run bash -c "printf '' | '$CLI' report"
  [ "$status" -eq 2 ]
  [ "$(sq "SELECT count(*) FROM run_artifacts WHERE run_uid='$uid';")" = "0" ]
}

@test "report: a whitespace-only body is refused too" {
  uid=$(start_run)
  run bash -c "printf '   \n\n  \n' | '$CLI' report"
  [ "$status" -eq 2 ]
  [ "$(sq "SELECT count(*) FROM run_artifacts WHERE run_uid='$uid';")" = "0" ]
}

@test "report: --path records an artifact on disk without demanding a body" {
  # The path-only form is for evidence that lives as a file — a browse audit, a
  # screenshot. Requiring stdin as well made it hang at a terminal.
  uid=$(start_run)
  run "$CLI" report --run "$uid" --kind screenshot --path /tmp/shot.png < /dev/null
  [ "$status" -eq 0 ]
  [ "$(sq "SELECT path FROM run_artifacts WHERE run_uid='$uid';")" = "/tmp/shot.png" ]
}

@test "report: a scrape declines rather than overwrite the run's own words" {
  # The board decides to scrape from a read taken moments earlier; a run
  # reaching Gate 3 in between must not have its complete summary replaced by
  # one viewport of terminal.
  uid=$(start_run)
  printf 'the complete summary\n' | "$CLI" report >/dev/null
  run bash -c "printf 'one viewport of terminal\n' | '$CLI' report --source pane"
  [ "$status" -eq 0 ]
  [ "$(sq "SELECT source FROM run_artifacts WHERE run_uid='$uid';")" = "run" ]
  [ "$(sq "SELECT body FROM run_artifacts WHERE run_uid='$uid';")" = "the complete summary" ]
}

@test "report: a scrape still replaces an earlier scrape" {
  uid=$(start_run)
  printf 'first scrape\n'  | "$CLI" report --source pane >/dev/null
  printf 'second scrape\n' | "$CLI" report --source pane >/dev/null
  [ "$(sq "SELECT count(*) FROM run_artifacts WHERE run_uid='$uid';")" = "1" ]
  [ "$(sq "SELECT body FROM run_artifacts WHERE run_uid='$uid';")" = "second scrape" ]
}

@test "report: the run's own words replace an earlier scrape" {
  uid=$(start_run)
  printf 'scraped guess\n' | "$CLI" report --source pane >/dev/null
  printf 'the real thing\n' | "$CLI" report >/dev/null
  [ "$(sq "SELECT source FROM run_artifacts WHERE run_uid='$uid';")" = "run" ]
  [ "$(sq "SELECT body FROM run_artifacts WHERE run_uid='$uid';")" = "the real thing" ]
}
