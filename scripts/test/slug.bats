#!/usr/bin/env bats
# Tests for bin/smriti-slug — slug derivation + caching.
# Run via: bun run test (which shells out to scripts/run-tests.sh)

setup() {
  ROOT="$BATS_TEST_DIRNAME/../.."
  WORK=$(mktemp -d)

  FAKE_BIN="$WORK/fake-bin"
  mkdir -p "$FAKE_BIN"
  ln -s "$ROOT/bin/smriti-slug" "$FAKE_BIN/smriti-slug"
  CLI="$FAKE_BIN/smriti-slug"

  export SMRITI_HOME="$WORK/state"
  mkdir -p "$SMRITI_HOME/slug-cache"

  # Create a temp git repo for deterministic slug derivation.
  # Resolve through git rev-parse so $REPO matches what smriti-slug sees
  # (macOS /tmp → /private/tmp symlink).
  mkdir -p "$WORK/test-repo"
  git -C "$WORK/test-repo" init -q
  REPO=$(git -C "$WORK/test-repo" rev-parse --show-toplevel)
}

teardown() {
  cd /
  rm -rf "$WORK"
}

@test "new repo: writes KV-format cache file with SLUG and SOURCE_PATH" {
  cd "$REPO"
  run "$CLI" --print
  [ "$status" -eq 0 ]
  local slug="$output"

  # Find the cache file (keyed by path hash).
  local cache_file
  cache_file=$(ls "$SMRITI_HOME/slug-cache/"* 2>/dev/null | head -1)
  [ -n "$cache_file" ]

  # Cache file has both keys.
  grep -q "^SLUG=$slug\$" "$cache_file"
  grep -q "^SOURCE_PATH=$REPO\$" "$cache_file"
}

@test "new repo: eval output includes SOURCE_PATH" {
  cd "$REPO"
  local eval_output
  eval_output=$("$CLI")

  echo "$eval_output" | grep -q '^SLUG='
  echo "$eval_output" | grep -q '^IS_FIRST_TIME=yes'
  echo "$eval_output" | grep -q '^SLUG_CACHE_FILE='
  echo "$eval_output" | grep -q '^SOURCE_PATH='
}

@test "cached repo: re-read returns same slug, IS_FIRST_TIME=no" {
  cd "$REPO"
  local first_slug
  first_slug=$("$CLI" --print)

  local second_output
  second_output=$("$CLI")
  echo "$second_output" | grep -q "^SLUG=$first_slug\$"
  echo "$second_output" | grep -q '^IS_FIRST_TIME=no'
}

@test "legacy single-line cache: reads slug correctly" {
  cd "$REPO"
  # Pre-populate cache in old format (just the slug, no KV).
  local path_hash
  path_hash=$(printf '%s' "$REPO" | shasum -a 256 | cut -c1-16)
  printf 'legacy-slug' > "$SMRITI_HOME/slug-cache/$path_hash"

  run "$CLI" --print
  [ "$status" -eq 0 ]
  [ "$output" = "legacy-slug" ]
}

@test "legacy single-line cache: lazily upgraded to KV format" {
  cd "$REPO"
  local path_hash
  path_hash=$(printf '%s' "$REPO" | shasum -a 256 | cut -c1-16)
  printf 'legacy-slug' > "$SMRITI_HOME/slug-cache/$path_hash"

  "$CLI" --print >/dev/null

  # Cache file should now be KV format.
  grep -q '^SLUG=legacy-slug$' "$SMRITI_HOME/slug-cache/$path_hash"
  grep -q "^SOURCE_PATH=$REPO\$" "$SMRITI_HOME/slug-cache/$path_hash"
}

@test "remote-added detection: path-* slug with remote prints migration notice" {
  cd "$REPO"
  # First invocation: no remote → path-* slug.
  local slug
  slug=$("$CLI" --print)
  [[ "$slug" == path-* ]]

  # Add a remote.
  git -C "$REPO" remote add origin https://github.com/test/my-repo.git

  # Second invocation: stderr should contain migration notice.
  local stderr_output
  stderr_output=$("$CLI" --print 2>&1 1>/dev/null)
  [[ "$stderr_output" == *"NOTE:"* ]]
  [[ "$stderr_output" == *"test-my-repo"* ]]
  [[ "$stderr_output" == *"smriti project rename"* ]]
}

@test "no migration notice for non-path-* slugs" {
  cd "$REPO"
  git -C "$REPO" remote add origin https://github.com/test/my-repo.git

  # First invocation with remote → non-path slug.
  "$CLI" --print >/dev/null

  # Second invocation: no migration notice on stderr.
  local stderr_output
  stderr_output=$("$CLI" --print 2>&1 1>/dev/null)
  [ -z "$stderr_output" ]
}

@test "repo with remote: derives slug from remote URL" {
  cd "$REPO"
  git -C "$REPO" remote add origin git@github.com:acme/My-Project.git

  run "$CLI" --print
  [ "$status" -eq 0 ]
  [ "$output" = "acme-my-project" ]
}

@test "repo without remote: derives path-<hash> slug" {
  cd "$REPO"
  run "$CLI" --print
  [ "$status" -eq 0 ]
  [[ "$output" == path-* ]]
}
