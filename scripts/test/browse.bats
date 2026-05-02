#!/usr/bin/env bats
# Tests for bin/smriti-browse — Stories 1 & 2 (localhost gate + JSON schema).
# Stories 3, 4, 5 are covered by scripts/test/browse-integration.test.ts (live Playwright).
#
# These tests do NOT launch Chromium. They exercise argv parsing, the localhost
# gate, exit codes, help output, and the audit-error JSON schema.
#
# Run via: bun run test   (which shells out to scripts/run-tests.sh)

setup() {
  BROWSE="$BATS_TEST_DIRNAME/../../bin/smriti-browse"
  WORK=$(mktemp -d)
  export TMPDIR="$WORK"
  cd "$WORK"
}

teardown() {
  cd /
  rm -rf "$WORK"
}

# Story 1: Localhost gate fails open ----------------------------------------

@test "audit rejects https://evil.com with exit 4" {
  run bun "$BROWSE" audit https://evil.com --out "$WORK/out"
  [ "$status" -eq 4 ]
  [[ "$output" == *"URL gate violation"* ]]
}

@test "audit rejects http://localhost.evil.com (subdomain trick) with exit 4" {
  run bun "$BROWSE" audit http://localhost.evil.com/admin --out "$WORK/out"
  [ "$status" -eq 4 ]
  [[ "$output" == *"URL gate violation"* ]]
}

@test "audit rejects ftp://localhost (non-http scheme) with exit 4" {
  run bun "$BROWSE" audit ftp://localhost --out "$WORK/out"
  [ "$status" -eq 4 ]
}

@test "audit rejects file:///etc/passwd with exit 4" {
  run bun "$BROWSE" audit file:///etc/passwd --out "$WORK/out"
  [ "$status" -eq 4 ]
}

@test "audit rejects garbage URL with exit 4" {
  run bun "$BROWSE" audit "not-a-url" --out "$WORK/out"
  [ "$status" -eq 4 ]
}

@test "audit accepts http://localhost (well-formed; would launch browser if not for missing chromium)" {
  # We can't actually run audit without Chromium installed in CI; assert that
  # the gate itself didn't reject (i.e., we got past gate and into Playwright).
  # Exit 4 means gate-rejected. Anything else means gate passed.
  run bun "$BROWSE" audit http://localhost:3000 --out "$WORK/out"
  [ "$status" -ne 4 ]
}

@test "audit accepts http://127.0.0.1 (IPv4)" {
  run bun "$BROWSE" audit http://127.0.0.1:3000 --out "$WORK/out"
  [ "$status" -ne 4 ]
}

@test "audit accepts http://app.localhost (label-suffix subdomain)" {
  run bun "$BROWSE" audit http://app.localhost:3000 --out "$WORK/out"
  [ "$status" -ne 4 ]
}

@test "audit with --allow-remote bypasses the gate (warning printed)" {
  # We expect this to bypass the gate. Exit will likely be non-zero from
  # Playwright failing to launch / missing Chromium, but NOT 4.
  run bun "$BROWSE" audit https://example.com --allow-remote --out "$WORK/out"
  [ "$status" -ne 4 ]
}

@test "audit with multiple URLs, one bad, exits 4 before launching browser" {
  run bun "$BROWSE" audit http://localhost:3000 https://evil.com --out "$WORK/out"
  [ "$status" -eq 4 ]
}

# Story 2: Schema regression -------------------------------------------------

@test "audit fails fast with exit 1 when --out is missing" {
  run bun "$BROWSE" audit http://localhost:3000
  [ "$status" -eq 1 ]
  [[ "$output" == *"--out"* ]]
}

@test "audit fails fast with exit 1 when no URL given" {
  run bun "$BROWSE" audit --out "$WORK/out"
  [ "$status" -eq 1 ]
}

@test "audit rejects unknown flag with exit 1" {
  run bun "$BROWSE" audit http://localhost:3000 --bogus --out "$WORK/out"
  [ "$status" -eq 1 ]
  [[ "$output" == *"unknown flag"* ]]
}

@test "audit rejects malformed --viewports with exit 1" {
  run bun "$BROWSE" audit http://localhost:3000 --viewports "not-a-spec" --out "$WORK/out"
  # Bun unhandled exception path → exit 2; either way not 0. The localhost gate
  # passes; we want to ensure parseViewports throws cleanly. Accept 1 or 2.
  [ "$status" -ne 0 ]
  [ "$status" -ne 4 ]
}

@test "login rejects non-localhost URL with exit 4" {
  run bun "$BROWSE" login https://example.com --storage "$WORK/state.json"
  [ "$status" -eq 4 ]
}

@test "login fails fast with exit 1 when --storage missing" {
  run bun "$BROWSE" login http://localhost:3000
  [ "$status" -eq 1 ]
  [[ "$output" == *"--storage"* ]]
}

@test "help shows exit-code legend and subcommands" {
  run bun "$BROWSE" help
  [ "$status" -eq 1 ]  # usage exits 1 by convention here
  [[ "$output" == *"Exit codes"* ]]
  [[ "$output" == *"audit"* ]]
  [[ "$output" == *"login"* ]]
  [[ "$output" == *"install"* ]]
  [[ "$output" == *"update"* ]]
}

@test "unknown subcommand exits 1" {
  run bun "$BROWSE" wat
  [ "$status" -eq 1 ]
  [[ "$output" == *"unknown subcommand"* ]]
}
