#!/usr/bin/env bats
# Tests for bin/smriti-pr-title-rewrite.

setup() {
  TR="$BATS_TEST_DIRNAME/../../bin/smriti-pr-title-rewrite"
}

@test "prepends v<version> when title has no prefix" {
  run "$TR" "1.2.3" "fix(ship): drift"
  [ "$status" -eq 0 ]
  [ "$output" = "v1.2.3 fix(ship): drift" ]
}

@test "idempotent: title already has correct prefix" {
  run "$TR" "1.2.3" "v1.2.3 fix(ship): drift"
  [ "$status" -eq 0 ]
  [ "$output" = "v1.2.3 fix(ship): drift" ]
}

@test "replaces stale v<old> prefix with v<new>" {
  run "$TR" "1.2.3" "v1.0.0 fix(ship): drift"
  [ "$status" -eq 0 ]
  [ "$output" = "v1.2.3 fix(ship): drift" ]
}

@test "handles different version prefix length" {
  run "$TR" "1.2.3" "v10.20.30 fix"
  [ "$status" -eq 0 ]
  [ "$output" = "v1.2.3 fix" ]
}

@test "does not strip the literal word 'version'" {
  run "$TR" "1.2.3" "version 5 deploy"
  [ "$status" -eq 0 ]
  [ "$output" = "v1.2.3 version 5 deploy" ]
}

@test "does not strip single-segment 'v1'" {
  run "$TR" "1.2.3" "v1 fix"
  [ "$status" -eq 0 ]
  [ "$output" = "v1.2.3 v1 fix" ]
}

@test "does not strip two-segment 'v1.2'" {
  run "$TR" "1.2.3" "v1.2 fix"
  [ "$status" -eq 0 ]
  [ "$output" = "v1.2.3 v1.2 fix" ]
}

@test "rejects 4-part semver as version arg" {
  run "$TR" "1.2.3.4" "title"
  [ "$status" -eq 2 ]
}

@test "rejects glob metachars in version arg" {
  run "$TR" "1.*.0" "title"
  [ "$status" -eq 2 ]
}

@test "errors with usage on missing args" {
  run "$TR"
  [ "$status" -eq 2 ]
  [[ "$output" == *"usage"* ]]
}

@test "errors with usage when title missing" {
  run "$TR" "1.2.3"
  [ "$status" -eq 2 ]
}

@test "applying twice yields same result" {
  first=$("$TR" "1.2.3" "fix(ship): drift")
  second=$("$TR" "1.2.3" "$first")
  [ "$first" = "$second" ]
}
