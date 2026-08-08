#!/usr/bin/env bats
bats_require_minimum_version 1.5.0
# Tests for bin/smriti — the umbrella dispatcher.
# Run via: bun run test (which shells out to scripts/run-tests.sh)

setup() {
  ROOT="$BATS_TEST_DIRNAME/../.."
  WORK=$(mktemp -d)

  # Production-shape: symlink the dispatcher into a fake PATH dir.
  FAKE_BIN="$WORK/fake-bin"
  mkdir -p "$FAKE_BIN"
  ln -s "$ROOT/bin/smriti" "$FAKE_BIN/smriti"
  SMRITI="$FAKE_BIN/smriti"

  export SMRITI_HOME="$WORK/state"
  mkdir -p "$SMRITI_HOME"
}

teardown() {
  rm -rf "$WORK"
}

@test "no args: prints help and exits 0 when output is not a terminal" {
  # Bare `smriti` on a TTY opens the factory board. Piped or redirected it must
  # stay the predictable non-interactive dispatcher, so scripts keep working.
  run "$SMRITI"
  [ "$status" -eq 0 ]
  [[ "$output" == *"Usage: smriti"* ]]
  [[ "$output" == *"Commands:"* ]]
}

@test "--help: prints help and exits 0" {
  run "$SMRITI" --help
  [ "$status" -eq 0 ]
  [[ "$output" == *"Usage: smriti"* ]]
}

@test "--version: prints version" {
  run "$SMRITI" --version
  [ "$status" -eq 0 ]
  [[ "$output" == smriti* ]]
}

@test "unknown command: exits 127 with available commands" {
  run -127 "$SMRITI" nonexistent-command
  [[ "$output" == *"unknown command"* ]]
  [[ "$output" == *"Available commands"* ]]
}

@test "dispatches to config helper" {
  run "$SMRITI" config list
  [ "$status" -eq 0 ]
}

@test "dispatches to slug helper from a git repo" {
  cd "$ROOT"
  run "$SMRITI" slug --print
  [ "$status" -eq 0 ]
  [ -n "$output" ]
}

@test "dispatches to ticket helper" {
  run "$SMRITI" ticket --help
  [ "$status" -eq 2 ]
  [[ "$output" == *"usage:"* ]]
}

@test "dispatches to trace helper" {
  run "$SMRITI" trace --help
  [ "$status" -eq 2 ]
  [[ "$output" == *"usage:"* ]]
}

@test "help lists the factory, ticket and trace commands" {
  run "$SMRITI" help
  [ "$status" -eq 0 ]
  [[ "$output" == *"factory"* ]]
  [[ "$output" == *"ticket"* ]]
  [[ "$output" == *"trace"* ]]
}
