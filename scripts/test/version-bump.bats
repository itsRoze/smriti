#!/usr/bin/env bats
# Tests for bin/smriti-version-bump.
# Run via: scripts/test-version-bump.sh   (which shells out to bats)

setup() {
  VBUMP="$BATS_TEST_DIRNAME/../../bin/smriti-version-bump"
  WORK=$(mktemp -d)
  cd "$WORK"
  git init -q
  git config user.email "test@smriti.local"
  git config user.name "smriti-test"
}

teardown() {
  cd /
  rm -rf "$WORK"
}

# Helpers ---------------------------------------------------------------

# Initialize a git repo with VERSION + package.json on `main`, then branch off.
# Args: $1 = base version (e.g. "0.1.0")
seed_repo() {
  local base="$1"
  printf '%s\n' "$base" > VERSION
  printf '{"name":"test","version":"%s"}\n' "$base" > package.json
  git add . && git commit -q -m "initial"
  git branch -m main
  git checkout -q -b feat
}

set_version_files() {
  local v="$1"
  local p="$2"
  printf '%s\n' "$v" > VERSION
  jq --arg pv "$p" '.version = $pv' package.json > /tmp/pkg.tmp && mv /tmp/pkg.tmp package.json
}

# Classifier states ------------------------------------------------------

@test "classify: FRESH when VERSION matches base and pkg synced" {
  seed_repo "0.1.0"
  run "$VBUMP" classify "main"
  [ "$status" -eq 0 ]
  [ "$output" = "FRESH" ]
}

@test "classify: ALREADY_BUMPED when VERSION ahead and pkg synced" {
  seed_repo "0.1.0"
  set_version_files "0.2.0" "0.2.0"
  run "$VBUMP" classify "main"
  [ "$status" -eq 0 ]
  [ "$output" = "ALREADY_BUMPED" ]
}

@test "classify: DRIFT_STALE_PKG when VERSION ahead and pkg stale" {
  seed_repo "0.1.0"
  set_version_files "0.2.0" "0.1.0"
  run "$VBUMP" classify "main"
  [ "$status" -eq 0 ]
  [ "$output" = "DRIFT_STALE_PKG" ]
}

@test "classify: DRIFT_UNEXPECTED when VERSION at base but pkg differs" {
  seed_repo "0.1.0"
  set_version_files "0.1.0" "0.99.0"
  run "$VBUMP" classify "main"
  [ "$status" -eq 0 ]
  [ "$output" = "DRIFT_UNEXPECTED" ]
}

@test "classify: FRESH when VERSION absent" {
  seed_repo "0.1.0"
  rm VERSION
  run "$VBUMP" classify "main"
  [ "$status" -eq 0 ]
  [ "$output" = "FRESH" ]
}

@test "classify: FRESH when package.json absent and VERSION matches base" {
  seed_repo "0.1.0"
  rm package.json
  git add -A && git commit -q -m "drop pkg"
  run "$VBUMP" classify "main"
  [ "$status" -eq 0 ]
  [ "$output" = "FRESH" ]
}

# CRLF + whitespace hardening -------------------------------------------

@test "classify: CRLF in VERSION does not false-classify as DRIFT" {
  seed_repo "0.1.0"
  printf '0.2.0\r\n' > VERSION
  jq --arg v "0.2.0" '.version = $v' package.json > /tmp/pkg.tmp && mv /tmp/pkg.tmp package.json
  run "$VBUMP" classify "main"
  [ "$status" -eq 0 ]
  [ "$output" = "ALREADY_BUMPED" ]
}

@test "classify: leading whitespace + newlines normalized" {
  seed_repo "0.1.0"
  printf '\n  0.2.0  \n' > VERSION
  jq --arg v "0.2.0" '.version = $v' package.json > /tmp/pkg.tmp && mv /tmp/pkg.tmp package.json
  run "$VBUMP" classify "main"
  [ "$status" -eq 0 ]
  [ "$output" = "ALREADY_BUMPED" ]
}

@test "read-version: strips CR and surrounding whitespace" {
  seed_repo "0.1.0"
  printf '\n  0.5.0  \r\n' > VERSION
  run "$VBUMP" read-version
  [ "$status" -eq 0 ]
  [ "$output" = "0.5.0" ]
}

# apply ------------------------------------------------------------------

@test "apply: writes both VERSION and package.json in sync" {
  seed_repo "0.1.0"
  run "$VBUMP" apply "1.2.3"
  [ "$status" -eq 0 ]
  [ "$output" = "1.2.3" ]
  [ "$(cat VERSION)" = "1.2.3" ]
  [ "$(jq -r .version package.json)" = "1.2.3" ]
}

@test "apply: rejects non-3-part-semver" {
  seed_repo "0.1.0"
  run "$VBUMP" apply "1.2.3.4"
  [ "$status" -eq 2 ]
  [[ "$output" == *"not a valid 3-part semver"* ]]
  [ "$(cat VERSION)" = "0.1.0" ]
}

@test "apply: rejects shell metacharacters" {
  seed_repo "0.1.0"
  run "$VBUMP" apply '1.2.3; rm -rf /'
  [ "$status" -eq 2 ]
  [ "$(cat VERSION)" = "0.1.0" ]
}

@test "apply: rejects empty arg" {
  seed_repo "0.1.0"
  run "$VBUMP" apply ""
  [ "$status" -eq 2 ]
}

@test "apply: silent when package.json absent" {
  seed_repo "0.1.0"
  rm package.json
  git add -A && git commit -q -m "drop pkg"
  run "$VBUMP" apply "1.2.3"
  [ "$status" -eq 0 ]
  [ "$(cat VERSION)" = "1.2.3" ]
}

@test "apply: idempotent on same input" {
  seed_repo "0.1.0"
  "$VBUMP" apply "1.2.3"
  run "$VBUMP" apply "1.2.3"
  [ "$status" -eq 0 ]
  [ "$(cat VERSION)" = "1.2.3" ]
  [ "$(jq -r .version package.json)" = "1.2.3" ]
}

# repair -----------------------------------------------------------------

@test "repair: syncs package.json to VERSION without re-bumping" {
  seed_repo "0.1.0"
  set_version_files "0.5.0" "0.1.0"
  run "$VBUMP" repair
  [ "$status" -eq 0 ]
  [ "$(cat VERSION)" = "0.5.0" ]
  [ "$(jq -r .version package.json)" = "0.5.0" ]
}

@test "repair: rejects malformed VERSION (no pkg corruption)" {
  seed_repo "0.1.0"
  printf 'not-semver\n' > VERSION
  jq --arg v "0.1.0" '.version = $v' package.json > /tmp/pkg.tmp && mv /tmp/pkg.tmp package.json
  run "$VBUMP" repair
  [ "$status" -eq 2 ]
  # package.json must NOT have been modified
  [ "$(jq -r .version package.json)" = "0.1.0" ]
}

@test "repair: silent when package.json absent" {
  seed_repo "0.1.0"
  printf '0.5.0\n' > VERSION
  rm package.json
  run "$VBUMP" repair
  [ "$status" -eq 0 ]
}

# Misc -------------------------------------------------------------------

@test "unknown subcommand exits 2" {
  seed_repo "0.1.0"
  run "$VBUMP" garbage
  [ "$status" -eq 2 ]
}

@test "no subcommand exits 2" {
  seed_repo "0.1.0"
  run "$VBUMP"
  [ "$status" -eq 2 ]
}
