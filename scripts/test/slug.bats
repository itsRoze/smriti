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
  [[ "$stderr_output" == *"smriti repo rename"* ]]
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

# ─── worktree identity ─────────────────────────────────────────────────

@test "IS_FIRST_TIME: a second worktree of a known repo is not first-time" {
  # The slug cache is keyed by path, so every freshly-cut worktree used to look
  # like a brand-new project and fire the first-run nudge. With a ticket per
  # worktree that would happen on every single ticket.
  mkdir -p "$WORK/wt-repo"
  git -C "$WORK/wt-repo" init -q -b main
  git -C "$WORK/wt-repo" config user.email "test@smriti.local"
  git -C "$WORK/wt-repo" config user.name "smriti-test"
  git -C "$WORK/wt-repo" remote add origin "https://github.com/test/known.git"
  echo seed > "$WORK/wt-repo/f"
  git -C "$WORK/wt-repo" add f
  git -C "$WORK/wt-repo" commit -q -m init
  local root; root=$(git -C "$WORK/wt-repo" rev-parse --show-toplevel)

  run bash -c "cd '$root' && '$CLI'"
  [[ "$output" == *"IS_FIRST_TIME=yes"* ]]

  git -C "$root" worktree add -q "$WORK/linked" -b feature
  run bash -c "cd '$WORK/linked' && '$CLI'"
  [[ "$output" == *"SLUG=test-known"* ]]
  [[ "$output" == *"IS_FIRST_TIME=no"* ]]
}

@test "IS_FIRST_TIME: a genuinely different repo is still first-time" {
  # The guard above must not be so broad that new projects stop being detected.
  mkdir -p "$WORK/repo-a" "$WORK/repo-b"
  for r in repo-a repo-b; do
    git -C "$WORK/$r" init -q -b main
    git -C "$WORK/$r" remote add origin "https://github.com/test/$r.git"
  done

  run bash -c "cd \"\$(git -C '$WORK/repo-a' rev-parse --show-toplevel)\" && '$CLI'"
  [[ "$output" == *"IS_FIRST_TIME=yes"* ]]
  run bash -c "cd \"\$(git -C '$WORK/repo-b' rev-parse --show-toplevel)\" && '$CLI'"
  [[ "$output" == *"IS_FIRST_TIME=yes"* ]]
}
