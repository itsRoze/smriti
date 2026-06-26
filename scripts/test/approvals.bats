#!/usr/bin/env bats
# Tests for bin/smriti-approvals — migration block + production-shape (PATH-symlink) invocation.
# Run via: bun run test (which shells out to scripts/run-tests.sh)

setup() {
  ROOT="$BATS_TEST_DIRNAME/../.."
  WORK=$(mktemp -d)
  cd "$WORK"
  git init -q

  # Mimic ~/.local/bin/ install: symlink ONLY smriti-approvals into a fake bin dir.
  # When the script looks for sibling helpers like smriti-slug at $SMRITI_BIN/, the lookup
  # fails silently and the script falls back to the env SLUG/BRANCH we set below.
  # This exercises the production install path — the class of path-resolution bug that absolute-path tests miss.
  FAKE_BIN="$WORK/fake-bin"
  mkdir -p "$FAKE_BIN"
  ln -s "$ROOT/bin/smriti-approvals" "$FAKE_BIN/smriti-approvals"
  CLI="$FAKE_BIN/smriti-approvals"

  # Sandboxed state — SLUG/BRANCH are read by the script's env fallback.
  export SMRITI_HOME="$WORK/.smriti"
  export SLUG="approvals-test"
  export BRANCH="test-branch"
  STATE_DIR="$SMRITI_HOME/projects/$SLUG"
  STATE_FILE="$STATE_DIR/${BRANCH}-approvals.json"
  mkdir -p "$STATE_DIR"
}

teardown() {
  cd /
  rm -rf "$WORK"
}

# ─── Migration: legacy office-hours key → brainstorm ──────────────────────

@test "migration: legacy office-hours key renames to brainstorm, values preserved" {
  cat > "$STATE_FILE" <<'EOF'
{"office-hours":{"status":"APPROVED","note":"mode: users; rec: Option 2","date":"2026-04-26"},"plan-eng-review":{"status":"NOT_YET_RUN"}}
EOF

  run "$CLI" get-json
  [ "$status" -eq 0 ]

  brainstorm_status=$(jq -r '.brainstorm.status' "$STATE_FILE")
  [ "$brainstorm_status" = "APPROVED" ]
  brainstorm_note=$(jq -r '.brainstorm.note' "$STATE_FILE")
  [ "$brainstorm_note" = "mode: users; rec: Option 2" ]
  brainstorm_date=$(jq -r '.brainstorm.date' "$STATE_FILE")
  [ "$brainstorm_date" = "2026-04-26" ]

  has_legacy=$(jq 'has("office-hours")' "$STATE_FILE")
  [ "$has_legacy" = "false" ]

  # Untouched keys survive
  pe_status=$(jq -r '."plan-eng-review".status' "$STATE_FILE")
  [ "$pe_status" = "NOT_YET_RUN" ]
}

# ─── Idempotency ─────────────────────────────────────────────────────────

@test "migration: no-op when office-hours key absent" {
  cat > "$STATE_FILE" <<'EOF'
{"brainstorm":{"status":"APPROVED","note":"existing","date":"2026-05-13"},"plan-eng-review":{"status":"NOT_YET_RUN"}}
EOF

  HASH_BEFORE=$(shasum "$STATE_FILE" | awk '{print $1}')
  run "$CLI" get-json
  [ "$status" -eq 0 ]
  HASH_AFTER=$(shasum "$STATE_FILE" | awk '{print $1}')

  [ "$HASH_BEFORE" = "$HASH_AFTER" ]
}

@test "migration: both keys present + brainstorm at default → legacy value promotes" {
  cat > "$STATE_FILE" <<'EOF'
{"office-hours":{"status":"APPROVED","date":"2026-04-26"},"brainstorm":{"status":"NOT_YET_RUN"}}
EOF

  run "$CLI" get-json
  [ "$status" -eq 0 ]

  brainstorm_status=$(jq -r '.brainstorm.status' "$STATE_FILE")
  [ "$brainstorm_status" = "APPROVED" ]
  brainstorm_date=$(jq -r '.brainstorm.date' "$STATE_FILE")
  [ "$brainstorm_date" = "2026-04-26" ]

  has_legacy=$(jq 'has("office-hours")' "$STATE_FILE")
  [ "$has_legacy" = "false" ]
}

@test "migration: both keys present + brainstorm non-default → brainstorm preserved" {
  cat > "$STATE_FILE" <<'EOF'
{"office-hours":{"status":"APPROVED","date":"2026-04-26"},"brainstorm":{"status":"CONDITIONAL","note":"newer","date":"2026-05-13"}}
EOF

  run "$CLI" get-json
  [ "$status" -eq 0 ]

  # Newer brainstorm value survives unchanged
  brainstorm_status=$(jq -r '.brainstorm.status' "$STATE_FILE")
  [ "$brainstorm_status" = "CONDITIONAL" ]
  brainstorm_note=$(jq -r '.brainstorm.note' "$STATE_FILE")
  [ "$brainstorm_note" = "newer" ]
  brainstorm_date=$(jq -r '.brainstorm.date' "$STATE_FILE")
  [ "$brainstorm_date" = "2026-05-13" ]

  # Legacy key still removed
  has_legacy=$(jq 'has("office-hours")' "$STATE_FILE")
  [ "$has_legacy" = "false" ]
}

@test "migration: second run after migration is a no-op" {
  cat > "$STATE_FILE" <<'EOF'
{"office-hours":{"status":"APPROVED","date":"2026-04-26"}}
EOF

  run "$CLI" get-json
  [ "$status" -eq 0 ]
  HASH_AFTER_FIRST=$(shasum "$STATE_FILE" | awk '{print $1}')

  run "$CLI" get-json
  [ "$status" -eq 0 ]
  HASH_AFTER_SECOND=$(shasum "$STATE_FILE" | awk '{print $1}')

  [ "$HASH_AFTER_FIRST" = "$HASH_AFTER_SECOND" ]
}

# ─── Error visibility — malformed state file ───────────────────────────────

@test "malformed JSON state file: exits non-zero with actionable message" {
  printf 'not valid json{{{' > "$STATE_FILE"

  run "$CLI" get
  [ "$status" -ne 0 ]
  [[ "$output" == *"malformed JSON"* ]]
  [[ "$output" == *"fix or delete it"* ]]
  [[ "$output" == *"$STATE_FILE"* ]]
}

@test "malformed JSON state file: blocks set subcommand too" {
  printf '{"truncated":' > "$STATE_FILE"

  run "$CLI" set eng-review APPROVED
  [ "$status" -ne 0 ]
  [[ "$output" == *"malformed JSON"* ]]
}

@test "smriti-slug failure: warns to stderr and falls back to SLUG=unknown" {
  # Create a smriti-slug stub that exits non-zero (simulates broken helper)
  printf '#!/usr/bin/env bash\nexit 1\n' > "$FAKE_BIN/smriti-slug"
  chmod +x "$FAKE_BIN/smriti-slug"
  unset SLUG

  run "$CLI" get
  [ "$status" -eq 0 ]
  [[ "$output" == *"smriti-slug failed"* ]]
}

# ─── Output sanity — migration is invisible to consumers ─────────────────

@test "post-migration: render shows brainstorm row (not office-hours)" {
  cat > "$STATE_FILE" <<'EOF'
{"office-hours":{"status":"APPROVED","date":"2026-04-26"}}
EOF

  run "$CLI" get
  [ "$status" -eq 0 ]
  [[ "$output" == *"/brainstorm"* ]]
  [[ "$output" != *"/office-hours"* ]]
}
