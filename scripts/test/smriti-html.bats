#!/usr/bin/env bats
bats_require_minimum_version 1.5.0
# Tests for bin/smriti-html — U1 (render + canonical schema + finding-identity
# contract + copy-paste floor) and U2a (session/revision/staleness argv).
# Run via: bun run test   (which shells out to scripts/run-tests.sh)

setup() {
  ROOT="$BATS_TEST_DIRNAME/../.."
  HTML="$ROOT/bin/smriti-html"
  WORK=$(mktemp -d)
  export SMRITI_HOME="$WORK/state"
  mkdir -p "$SMRITI_HOME"

  SPEC="$WORK/spec.json"
  cat > "$SPEC" <<'JSON'
{
  "title": "Plan review",
  "skill": "plan-eng-review",
  "session_id": "sess-abc123",
  "revision_id": "rev-1",
  "source_hash": "deadbeef",
  "sections": [
    { "id": "arch", "title": "Architecture", "cards": [
      { "id": "f-001", "title": "First finding", "body_md": "**ELI10:** a `thing`.", "status": "open", "default_decision": "accept" },
      { "id": "f-002", "title": "Second finding", "body_md": "body two", "status": "new" }
    ]}
  ],
  "global_notes_prompt": "Overall?"
}
JSON
}

teardown() {
  rm -rf "$WORK"
}

# ─── check-spec ──────────────────────────────────────────────────────────────

@test "check-spec: valid spec exits 0" {
  run bun "$HTML" check-spec "$SPEC"
  [ "$status" -eq 0 ]
  [[ "$output" == *"ok"* ]]
}

@test "check-spec: missing card id exits 3" {
  cat > "$WORK/bad.json" <<'JSON'
{ "title":"x","skill":"s","session_id":"a","revision_id":"b","source_hash":"c",
  "sections":[{"id":"s1","title":"S","cards":[{"title":"no id","body_md":"x"}]}] }
JSON
  run bun "$HTML" check-spec "$WORK/bad.json"
  [ "$status" -eq 3 ]
}

@test "check-spec: unknown top-level field exits 3" {
  cat > "$WORK/bad.json" <<'JSON'
{ "title":"x","skill":"s","session_id":"a","revision_id":"b","source_hash":"c","bogus":1,
  "sections":[{"id":"s1","title":"S","cards":[{"id":"c1","title":"t","body_md":"x"}]}] }
JSON
  run bun "$HTML" check-spec "$WORK/bad.json"
  [ "$status" -eq 3 ]
}

@test "check-spec: duplicate card id exits 3 (D7 ids must be unique)" {
  cat > "$WORK/dup.json" <<'JSON'
{ "title":"x","skill":"s","session_id":"a","revision_id":"b","source_hash":"c",
  "sections":[{"id":"s1","title":"S","cards":[
    {"id":"dup","title":"t","body_md":"x"},{"id":"dup","title":"u","body_md":"y"}]}] }
JSON
  run bun "$HTML" check-spec "$WORK/dup.json"
  [ "$status" -eq 3 ]
}

# ─── render ──────────────────────────────────────────────────────────────────

@test "render: valid spec writes HTML containing every card id" {
  run bun "$HTML" render "$SPEC" --out "$WORK/out.html" --no-open
  [ "$status" -eq 0 ]
  [ -f "$WORK/out.html" ]
  grep -q "f-001" "$WORK/out.html"
  grep -q "f-002" "$WORK/out.html"
}

@test "render: HTML embeds session/revision/source_hash (copy-paste identity floor)" {
  run bun "$HTML" render "$SPEC" --out "$WORK/out.html" --no-open
  [ "$status" -eq 0 ]
  grep -q "sess-abc123" "$WORK/out.html"
  grep -q "rev-1" "$WORK/out.html"
  grep -q "deadbeef" "$WORK/out.html"
}

@test "render: malformed spec exits 3, writes no file" {
  cat > "$WORK/bad.json" <<'JSON'
{ "title":"x" }
JSON
  run bun "$HTML" render "$WORK/bad.json" --out "$WORK/nope.html" --no-open
  [ "$status" -eq 3 ]
  [ ! -f "$WORK/nope.html" ]
}

# ─── check-payload (D7 finding-identity reconciliation) ──────────────────────

@test "check-payload: all-known ids exits 0 with empty unknown list" {
  cat > "$WORK/p.json" <<'JSON'
{ "session_id":"sess-abc123","revision_id":"rev-1","source_hash":"deadbeef","action":"submit",
  "decisions": { "f-001": {"decision":"accept"}, "f-002": {"decision":"edit","edited_text":"x","notes":"n"} } }
JSON
  run bun "$HTML" check-payload "$WORK/p.json" --spec "$SPEC"
  [ "$status" -eq 0 ]
  [[ "$output" == *'"ok":true'* ]]
  [[ "$output" == *'"unknown_card_ids":[]'* ]]
}

@test "check-payload: unknown card id is rejected, never silently applied (D7)" {
  cat > "$WORK/p.json" <<'JSON'
{ "session_id":"sess-abc123","revision_id":"rev-1","source_hash":"deadbeef","action":"submit",
  "decisions": { "f-999": {"decision":"accept"} } }
JSON
  run bun "$HTML" check-payload "$WORK/p.json" --spec "$SPEC"
  [ "$status" -eq 3 ]
  [[ "$output" == *"f-999"* ]]
  [[ "$output" == *'"ok":false'* ]]
}

@test "check-payload: invalid decision value exits 3" {
  cat > "$WORK/p.json" <<'JSON'
{ "session_id":"sess-abc123","revision_id":"rev-1","source_hash":"deadbeef","action":"submit",
  "decisions": { "f-001": {"decision":"maybe"} } }
JSON
  run bun "$HTML" check-payload "$WORK/p.json" --spec "$SPEC"
  [ "$status" -eq 3 ]
}

# ─── usage ───────────────────────────────────────────────────────────────────

@test "no args: prints usage and exits 1" {
  run bun "$HTML"
  [ "$status" -eq 1 ]
  [[ "$output" == *"render"* ]]
  [[ "$output" == *"Exit codes:"* ]]
}

@test "unknown subcommand exits non-zero" {
  run bun "$HTML" frobnicate
  [ "$status" -ne 0 ]
}

# ─── transport argv (U2a — no server spun up) ────────────────────────────────

@test "serve: missing spec is a usage error" {
  run bun "$HTML" serve
  [ "$status" -eq 1 ]
}

@test "await: missing --session is a usage error" {
  run bun "$HTML" await
  [ "$status" -eq 1 ]
}

@test "stop: missing --session is a usage error" {
  run bun "$HTML" stop
  [ "$status" -eq 1 ]
}

@test "render --session: missing spec is a usage error" {
  run bun "$HTML" render --session sess-x
  [ "$status" -eq 1 ]
}

@test "await: nonexistent session exits 6 (no live server)" {
  run bun "$HTML" await --session sess-does-not-exist --timeout 300
  [ "$status" -eq 6 ]
}

@test "stop: nonexistent session is idempotent (exit 0, already stopped)" {
  run bun "$HTML" stop --session sess-does-not-exist
  [ "$status" -eq 0 ]
  [[ "$output" == *"already stopped"* ]]
}

# ─── ELI-37: production invocation path via the PATH dispatcher ───────────────

@test "dispatcher: 'smriti html' routes to bin/smriti-html (production path)" {
  FAKE_BIN="$WORK/fake-bin"
  mkdir -p "$FAKE_BIN"
  ln -s "$ROOT/bin/smriti" "$FAKE_BIN/smriti"
  run env PATH="$FAKE_BIN:$PATH" smriti html check-spec "$SPEC"
  [ "$status" -eq 0 ]
  [[ "$output" == *"ok"* ]]
}
