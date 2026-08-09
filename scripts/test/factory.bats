#!/usr/bin/env bats
# Tests for bin/smriti-factory — the front door.
# Covers the non-interactive surface: the plain listing, argument handling, and
# the data contract it reads from smriti-ticket/smriti-trace. The raw-mode
# keyboard loop is not driven here; what is locked down is that the listing
# stays correct and that a non-TTY never gets a full-screen redraw.
#
# Run via: bun run test (which shells out to scripts/run-tests.sh)

setup() {
  ROOT="$BATS_TEST_DIRNAME/../.."
  WORK=$(mktemp -d)

  FAKE_BIN="$WORK/fake-bin"
  REPO="$WORK/repo"
  mkdir -p "$FAKE_BIN" "$REPO"
  for h in smriti-factory smriti-ticket smriti-trace smriti-slug smriti-project; do
    ln -s "$ROOT/bin/$h" "$FAKE_BIN/$h"
  done
  CLI="$FAKE_BIN/smriti-factory"
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
  echo seed > f && git add f && git commit -q -m init
}

teardown() {
  PATH="$ORIG_PATH"
  cd /
  rm -rf "$WORK"
}

# ─── listing ────────────────────────────────────────────────────────────────

@test "empty store: says so rather than printing an empty board" {
  run bun "$CLI" --list
  [ "$status" -eq 0 ]
  [[ "$output" == *"no open tickets"* ]]
}

@test "lists tickets grouped under their app" {
  "$TICKET" add "Export to CSV" >/dev/null
  "$TICKET" add "Dark mode" --repo portfolio >/dev/null

  run bun "$CLI" --list
  [ "$status" -eq 0 ]
  [[ "$output" == *"test-demo"* ]]
  [[ "$output" == *"portfolio"* ]]
  [[ "$output" == *"Export to CSV"* ]]
  [[ "$output" == *"Dark mode"* ]]
}

@test "shipped tickets are hidden from the board" {
  "$TICKET" add "open" >/dev/null
  "$TICKET" add "closed" >/dev/null
  "$TICKET" done 2 >/dev/null

  run bun "$CLI" --list
  [[ "$output" == *"open"* ]]
  ! [[ "$output" == *"closed"* ]]
}

@test "a run parked at a gate is flagged as waiting on you" {
  # The whole reason the board exists: seeing which run needs a decision
  # without going to find the terminal it is parked in.
  "$TICKET" add "Export to CSV" >/dev/null
  local uid
  uid=$("$TRACE" start begin --ticket 1 | cut -d= -f2-)
  "$TRACE" emit approve awaiting --run "$uid"

  run bun "$CLI" --list
  [[ "$output" == *"waiting on you"* ]]
  [[ "$output" == *"approve"* ]]
}

@test "a live run shows what skill is running" {
  "$TICKET" add "Export to CSV" >/dev/null
  local uid
  uid=$("$TRACE" start begin --ticket 1 | cut -d= -f2-)
  "$TRACE" emit implement start --run "$uid"

  run bun "$CLI" --list
  [[ "$output" == *"running begin"* ]]
}

@test "ordering puts work needing a decision above ideas" {
  "$TICKET" add "an idea" >/dev/null
  "$TICKET" add "in review" >/dev/null
  "$TICKET" status 2 in_review >/dev/null

  run bun "$CLI" --list
  # "in review" must appear before "an idea" in the output.
  local review_line idea_line
  review_line=$(echo "$output" | grep -n "in review" | head -1 | cut -d: -f1)
  idea_line=$(echo "$output" | grep -n "an idea" | head -1 | cut -d: -f1)
  [ "$review_line" -lt "$idea_line" ]
}

# ─── non-interactive safety ─────────────────────────────────────────────────

@test "bare invocation prints the listing — no server started, no browser opened" {
  # The interactive surface moved to `smriti board`; this binary must stay a
  # pure read. A server or browser materialising here would break every script
  # and pipe that uses it.
  "$TICKET" add "Export to CSV" >/dev/null
  run bun "$CLI"
  [ "$status" -eq 0 ]
  [[ "$output" == *"Export to CSV"* ]]
  [ ! -d "$SMRITI_HOME/.server" ]
}

@test "a broken ticket store degrades to an empty board, not a crash" {
  # The board is a read surface; it must never be the thing that stops you.
  printf 'not a database' > "$SMRITI_HOME/factory.db"
  run bun "$CLI" --list
  [ "$status" -eq 0 ]
}

# ─── usage ──────────────────────────────────────────────────────────────────

@test "--help exits 1 and points at the board" {
  run bun "$CLI" --help
  [ "$status" -eq 1 ]
  [[ "$output" == *"smriti board"* ]]
}

@test "unknown flag exits 1 (usage), matching smriti-html and smriti-browse" {
  run bun "$CLI" --bogus
  [ "$status" -eq 1 ]
  [[ "$output" == *"unknown flag"* ]]
}

@test "unexpected positional argument exits 1" {
  run bun "$CLI" wat
  [ "$status" -eq 1 ]
}

@test "a run with no ticket still reaches the board when it parks at a gate" {
  # /debug on a hand-cut branch has no ticket. Keying the board purely off
  # tickets made such a run invisible, so the gate it was waiting at never
  # showed under "waiting on you" — the one thing the board exists to surface.
  local uid
  uid=$("$TRACE" start debug | cut -d= -f2-)
  "$TRACE" emit approve awaiting --run "$uid"

  run bun "$CLI" --list
  [ "$status" -eq 0 ]
  [[ "$output" == *"waiting on you"* ]]
  [[ "$output" == *"debug"* ]]
}

@test "the board renders tickets and ticketless runs together" {
  "$TICKET" add "Export to CSV" >/dev/null
  local uid
  uid=$("$TRACE" start debug | cut -d= -f2-)
  "$TRACE" emit approve awaiting --run "$uid"

  run bun "$CLI" --list
  [[ "$output" == *"Export to CSV"* ]]
  [[ "$output" == *"debug on"* ]]
}
