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

# ─── production invocation path via the PATH dispatcher ───────────────────────

@test "dispatcher: 'smriti html' routes to bin/smriti-html (production path)" {
  FAKE_BIN="$WORK/fake-bin"
  mkdir -p "$FAKE_BIN"
  ln -s "$ROOT/bin/smriti" "$FAKE_BIN/smriti"
  run env PATH="$FAKE_BIN:$PATH" smriti html check-spec "$SPEC"
  [ "$status" -eq 0 ]
  [[ "$output" == *"ok"* ]]
}

# ─── mockup_html (T8) ────────────────────────────────────────────────────────
#
# /begin has always told the agent to put a mockup in front of you at Gate 2,
# and there was nowhere to put one: body_md is escape-first, so a mockup
# rendered as a wall of visible source. A real card was found carrying 21,534
# characters of HTML shown as text.

mockup_spec() {
  cat > "$WORK/mock.json" <<'JSON'
{
  "title": "Design review", "skill": "begin", "session_id": "s", "revision_id": "rev-1",
  "source_hash": "h",
  "sections": [ { "id": "design", "title": "Design", "cards": [
    { "id": "design-1", "title": "The new board", "body_md": "see below",
      "mockup_html": "<!doctype html><style>:root{--paper:#123456;--ink:#abcdef}</style><h1>Mockup \"quoted\" & <b>bold</b></h1>" },
    { "id": "plain-1", "title": "No mockup", "body_md": "prose only" }
  ]}]
}
JSON
  echo "$WORK/mock.json"
}

@test "mockup: a card with mockup_html renders a sandboxed iframe" {
  local spec; spec=$(mockup_spec)
  run bun "$HTML" render "$spec" --out "$WORK/out.html" --no-open
  [ "$status" -eq 0 ]
  grep -q 'sandbox="allow-scripts"' "$WORK/out.html"
  grep -q 'srcdoc=' "$WORK/out.html"
}

@test "mockup: the sandbox NEVER grants allow-same-origin" {
  # allow-scripts WITHOUT allow-same-origin is the whole safety property: a
  # frame granted both can remove its own sandbox, reach this page, and touch
  # the decision-submit path. Asserted on the attribute itself, since the words
  # also appear in the page's explanatory comments.
  local spec; spec=$(mockup_spec)
  bun "$HTML" render "$spec" --out "$WORK/out.html" --no-open
  run grep -o 'sandbox="[^"]*"' "$WORK/out.html"
  [ "$status" -eq 0 ]
  while read -r attr; do
    [[ "$attr" == 'sandbox="allow-scripts"' ]]
  done <<< "$output"
}

@test "mockup: the markup never appears as escaped source in the page body" {
  # The actual bug: <h1> shown to the reader as &lt;h1&gt;.
  local spec; spec=$(mockup_spec)
  bun "$HTML" render "$spec" --out "$WORK/out.html" --no-open
  # Strip every srcdoc attribute — what is left is what the reader sees.
  # Slurped (-0777), not line-wise: the injected height shim spans lines, so the
  # attribute does too, and a per-line regex would leave most of it behind.
  perl -0777 -pe 's/srcdoc="[^"]*"//g' "$WORK/out.html" > "$WORK/visible.html"
  ! grep -q '&lt;h1&gt;Mockup' "$WORK/visible.html"
  ! grep -q '&lt;!doctype' "$WORK/visible.html"
}

@test "mockup: the height shim is injected so the frame can size itself" {
  local spec; spec=$(mockup_spec)
  bun "$HTML" render "$spec" --out "$WORK/out.html" --no-open
  grep -q '__smriti_mockup_height' "$WORK/out.html"
}

@test "mockup: a card without the field renders no iframe at all" {
  run bun "$HTML" render "$SPEC" --out "$WORK/plain.html" --no-open
  [ "$status" -eq 0 ]
  ! grep -q '<iframe' "$WORK/plain.html"
}

@test "mockup: an empty mockup_html is rejected" {
  cat > "$WORK/bad.json" <<'JSON'
{ "title": "t", "skill": "s", "session_id": "s", "revision_id": "r", "source_hash": "h",
  "sections": [ { "id": "a", "title": "A", "cards": [
    { "id": "c1", "title": "t", "body_md": "b", "mockup_html": "" } ]}]}
JSON
  run bun "$HTML" check-spec "$WORK/bad.json"
  [ "$status" -eq 3 ]
}

@test "mockup: a non-string mockup_html is rejected" {
  cat > "$WORK/bad2.json" <<'JSON'
{ "title": "t", "skill": "s", "session_id": "s", "revision_id": "r", "source_hash": "h",
  "sections": [ { "id": "a", "title": "A", "cards": [
    { "id": "c1", "title": "t", "body_md": "b", "mockup_html": 42 } ]}]}
JSON
  run bun "$HTML" check-spec "$WORK/bad2.json"
  [ "$status" -eq 3 ]
}

# ─── url: liveness, proved (T8) ──────────────────────────────────────────────

@test "url: missing --session is a usage error" {
  run bun "$HTML" url
  [ "$status" -eq 1 ]
}

@test "url: an unknown session exits 6" {
  run bun "$HTML" url --session sess-nope
  [ "$status" -eq 6 ]
}

@test "url: a live session resolves to its real port" {
  local out; out=$(bun "$HTML" serve "$SPEC" --no-open --no-trace)
  local sid; sid=$(echo "$out" | jq -r .session_id)
  local port; port=$(echo "$out" | jq -r .port)

  run bun "$HTML" url --session "$sid"
  [ "$status" -eq 0 ]
  echo "$output" | jq -e --arg s "$sid" '.session_id == $s'
  echo "$output" | jq -e --argjson p "$port" '.port == $p'
  echo "$output" | jq -e --argjson p "$port" '.url == "http://127.0.0.1:\($p)/"'

  bun "$HTML" stop --session "$sid"
}

@test "url: after stop it exits 6" {
  local out; out=$(bun "$HTML" serve "$SPEC" --no-open --no-trace)
  local sid; sid=$(echo "$out" | jq -r .session_id)
  bun "$HTML" stop --session "$sid"
  run bun "$HTML" url --session "$sid"
  [ "$status" -eq 6 ]
}

@test "url: a portfile outliving its server exits 6 and sweeps the statedir" {
  # A crashed server leaves its portfile behind. Answering from the file alone
  # is what would put a dead link on the board — the whole reason `url` proves
  # pid, port AND session identity rather than trusting the file.
  local out; out=$(bun "$HTML" serve "$SPEC" --no-open --no-trace)
  local sid; sid=$(echo "$out" | jq -r .session_id)
  local dir="$SMRITI_HOME/html-sessions/$sid"
  local pid; pid=$(head -1 "$dir/pidfile")

  kill -9 "$pid"
  sleep 0.3
  [ -f "$dir/portfile" ]          # the stale state the old check would have believed

  run bun "$HTML" url --session "$sid"
  [ "$status" -eq 6 ]
  [ ! -d "$dir" ]                 # ...and it healed what it found
}

@test "url: session state is keyed by the id alone, not by repo" {
  # serve in one repo, resolve from another. The statedir used to hang off the
  # cwd's slug, so finding a session needed a second key that nothing guaranteed
  # would match the one the run was filed under.
  mkdir -p "$WORK/repo-a" "$WORK/repo-b"
  local out sid
  out=$(cd "$WORK/repo-a" && bun "$HTML" serve "$SPEC" --no-open --no-trace)
  sid=$(echo "$out" | jq -r .session_id)

  run bash -c "cd '$WORK/repo-b' && bun '$HTML' url --session '$sid'"
  [ "$status" -eq 0 ]
  run bash -c "cd '$WORK/repo-b' && bun '$HTML' stop --session '$sid'"
  [ "$status" -eq 0 ]
}

@test "serve: state lives under html-sessions/<id>, keyed by nothing else" {
  local out; out=$(bun "$HTML" serve "$SPEC" --no-open --no-trace)
  local sid; sid=$(echo "$out" | jq -r .session_id)
  [ -d "$SMRITI_HOME/html-sessions/$sid" ]
  [ -f "$SMRITI_HOME/html-sessions/$sid/portfile" ]
  bun "$HTML" stop --session "$sid"
}

@test "alive: the server answers with its own session id" {
  local out; out=$(bun "$HTML" serve "$SPEC" --no-open --no-trace)
  local sid; sid=$(echo "$out" | jq -r .session_id)
  local port; port=$(echo "$out" | jq -r .port)
  run curl -sf "http://127.0.0.1:$port/__alive"
  [ "$status" -eq 0 ]
  echo "$output" | jq -e --arg s "$sid" '.session_id == $s'
  bun "$HTML" stop --session "$sid"
}

# ─── gate bracketing (T8) ────────────────────────────────────────────────────
#
# The transport emits BOTH edges of the gate, because it is the only thing that
# knows them. It used to be an instruction in begin/SKILL.md.tmpl with nothing
# specified for leaving, and runs sat in `awaiting` for the rest of their lives:
# a false "waiting on you" over work that was quietly implementing, with all of
# its agent time booked against the human.

# A real run in a real repo, so `serve` has something to attach its gate to.
setup_run() {
  TRACE="$ROOT/bin/smriti-trace"
  REPO="$WORK/repo"
  mkdir -p "$REPO"
  cd "$REPO"
  git init -q -b main .
  git config user.email t@t.local; git config user.name t
  git remote add origin https://github.com/test/demo.git
  RUN=$("$TRACE" start begin | cut -d= -f2)
}
run_status() { "$TRACE" list --json | jq -r ".[] | select(.run_uid==\"$RUN\") | .status"; }
run_session() { "$TRACE" list --json | jq -r ".[] | select(.run_uid==\"$RUN\") | .html_session // \"none\""; }

@test "gate: serve opens it, recording the session for the board to click" {
  setup_run
  local sid; sid=$(bun "$HTML" serve "$SPEC" --no-open | jq -r .session_id)
  [ "$(run_status)" = "awaiting" ]
  [ "$(run_session)" = "$sid" ]
  bun "$HTML" stop --session "$sid"
}

@test "gate: stop closes it — an abandoned loop leaves no phantom" {
  setup_run
  local sid; sid=$(bun "$HTML" serve "$SPEC" --no-open | jq -r .session_id)
  bun "$HTML" stop --session "$sid"
  [ "$(run_status)" = "running" ]
  [ "$(run_session)" = "none" ]
}

@test "gate: render reopens it — the silent case before this change" {
  setup_run
  local sid; sid=$(bun "$HTML" serve "$SPEC" --no-open | jq -r .session_id)
  # Simulate the gate having been answered once.
  "$TRACE" emit approve ok --run "$RUN" --if-html-session "$sid"
  [ "$(run_status)" = "running" ]

  sed 's/"rev-1"/"rev-2"/' "$SPEC" > "$WORK/rev2.json"
  bun "$HTML" render --session "$sid" "$WORK/rev2.json"
  [ "$(run_status)" = "awaiting" ]
  [ "$(run_session)" = "$sid" ]
  bun "$HTML" stop --session "$sid"
}

@test "gate: --phase names the gate for a loop that is not /begin's" {
  setup_run
  local sid; sid=$(bun "$HTML" serve "$SPEC" --no-open --phase review | jq -r .session_id)
  run "$TRACE" list --json
  echo "$output" | jq -e ".[] | select(.run_uid==\"$RUN\") | .last_phase == \"review\""
  bun "$HTML" stop --session "$sid"
}

@test "gate: --no-trace touches the trace at all" {
  setup_run
  local sid; sid=$(bun "$HTML" serve "$SPEC" --no-open --no-trace | jq -r .session_id)
  [ "$(run_status)" = "running" ]
  [ "$(run_session)" = "none" ]
  bun "$HTML" stop --session "$sid"
  [ "$(run_status)" = "running" ]
}

@test "gate: with no open run, serve and stop still work" {
  # Bookkeeping must never break the review loop it is describing.
  mkdir -p "$WORK/norun"; cd "$WORK/norun"
  run bun "$HTML" serve "$SPEC" --no-open
  [ "$status" -eq 0 ]
  local sid; sid=$(echo "$output" | jq -r .session_id)
  run bun "$HTML" stop --session "$sid"
  [ "$status" -eq 0 ]
}

@test "gate: closing twice writes one event, not two" {
  setup_run
  local sid; sid=$(bun "$HTML" serve "$SPEC" --no-open | jq -r .session_id)
  "$TRACE" emit approve ok --run "$RUN" --if-html-session "$sid"   # as `await` would
  local before; before=$("$TRACE" tail --run "$RUN" --after 0 | wc -l | tr -d ' ')
  bun "$HTML" stop --session "$sid"                                 # ...then `stop`
  local after; after=$("$TRACE" tail --run "$RUN" --after 0 | wc -l | tr -d ' ')
  [ "$before" = "$after" ]
}

@test "gate: the session remembers its own run, so stop works from elsewhere" {
  setup_run
  local sid; sid=$(bun "$HTML" serve "$SPEC" --no-open | jq -r .session_id)
  [ -f "$SMRITI_HOME/html-sessions/$sid/trace.json" ]
  jq -e --arg r "$RUN" '.run_uid == $r and .phase == "approve"' \
    "$SMRITI_HOME/html-sessions/$sid/trace.json"

  mkdir -p "$WORK/elsewhere"
  ( cd "$WORK/elsewhere" && bun "$HTML" stop --session "$sid" )
  [ "$(run_status)" = "running" ]
}

@test "session id: a traversal attempt is 'no such session', not a path read" {
  # The id reaches smriti-html from the board, which reads it out of factory.db
  # — data, not a constant, and it is about to be joined onto a path.
  mkdir -p "$SMRITI_HOME/evil"
  printf '1234\nnonce\n' > "$SMRITI_HOME/evil/portfile"
  run bun "$HTML" url --session '../evil'
  [ "$status" -eq 6 ]
  run bun "$HTML" await --session '../evil' --timeout 300
  [ "$status" -eq 6 ]
  run bun "$HTML" stop --session '../evil'
  [ "$status" -eq 0 ]
  [ -f "$SMRITI_HOME/evil/portfile" ]   # and it did not delete what it found
}
