#!/usr/bin/env bats
# Tests for bin/smriti-default-branch.
# Run via: bun run test  (which shells out to scripts/run-tests.sh).

setup() {
  ROOT="$BATS_TEST_DIRNAME/../.."
  WORK=$(mktemp -d)
  cd "$WORK"

  # PATH-symlink invocation: exercise the production install shape, not the
  # in-repo absolute path. The lesson — early-exit help or argv[0]
  # behavior can differ between $0=absolute vs $0=symlink-in-PATH.
  FAKE_BIN="$WORK/fake-bin"
  mkdir -p "$FAKE_BIN"
  ln -s "$ROOT/bin/smriti-default-branch" "$FAKE_BIN/smriti-default-branch"
  CLI="$FAKE_BIN/smriti-default-branch"
}

teardown() {
  cd /
  rm -rf "$WORK"
}

init_repo() {
  git init -q
  git config user.email "test@smriti.local"
  git config user.name "smriti-test"
}

# Detection step 1: origin/HEAD ----------------------------------------

@test "origin/HEAD set -> emits that branch" {
  # Set up an upstream-style repo on disk so we can fake origin/HEAD.
  init_repo
  echo seed > f && git add f && git commit -q -m init
  git branch -m trunk
  # Fake an origin remote pointing at this repo, set its HEAD to trunk.
  git remote add origin "$WORK"
  git update-ref refs/remotes/origin/trunk HEAD
  git symbolic-ref refs/remotes/origin/HEAD refs/remotes/origin/trunk

  run "$CLI"
  [ "$status" -eq 0 ]
  [ "$output" = "trunk" ]
}

# Detection step 2: existing local refs --------------------------------

@test "no origin/HEAD, main exists -> main" {
  init_repo
  echo seed > f && git add f && git commit -q -m init
  git branch -m main

  run "$CLI"
  [ "$status" -eq 0 ]
  [ "$output" = "main" ]
}

@test "no origin/HEAD, only master exists -> master" {
  init_repo
  echo seed > f && git add f && git commit -q -m init
  git branch -m master

  run "$CLI"
  [ "$status" -eq 0 ]
  [ "$output" = "master" ]
}

@test "no origin/HEAD, only develop exists -> develop" {
  init_repo
  echo seed > f && git add f && git commit -q -m init
  git branch -m develop

  run "$CLI"
  [ "$status" -eq 0 ]
  [ "$output" = "develop" ]
}

# Detection step 3: init.defaultBranch ----------------------------------

@test "unborn repo with init.defaultBranch=custom -> custom" {
  init_repo
  # No commits yet → no refs of any kind exist
  git config init.defaultBranch custom

  run "$CLI"
  [ "$status" -eq 0 ]
  [ "$output" = "custom" ]
}

# Detection step 4: ultimate fallback -----------------------------------

@test "outside a git repo -> main (never empty, never fails)" {
  # WORK is empty + not a git repo (no init_repo)
  run "$CLI"
  [ "$status" -eq 0 ]
  [ "$output" = "main" ]
}
