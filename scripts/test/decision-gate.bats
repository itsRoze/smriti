#!/usr/bin/env bats
# Tests for the severity-gated decision cadence (ELI-style delegate posture):
#   1-3. Contract lint on lib/resolvers/ask-user-format.md — the gate's source
#        of truth that 7 skills inherit via {{ASK_USER_FORMAT}}.
#   4.   Drift guard: the two review skills that DON'T consume the resolver
#        (eng-review, design-review) must point back to it as source of truth.
#
# Run via: bun run test (which shells out to scripts/run-tests.sh)

setup() {
  ROOT="$BATS_TEST_DIRNAME/../.."
  GATE_FILE="$ROOT/lib/resolvers/ask-user-format.md"
}

# ─── Story 1: the gate triage is present ───────────────────────────────────

@test "ask-user-format declares the stakes triage (auto-resolve + genuine fork)" {
  grep -qi 'auto-resolve' "$GATE_FILE"
  grep -qi 'genuine fork' "$GATE_FILE"
  grep -qi 'triage' "$GATE_FILE"
}

@test "ask-user-format defines the run-digest review checkpoint" {
  grep -qi 'run digest' "$GATE_FILE"
  # The digest must enumerate what was decided for the user.
  grep -qi 'Decided' "$GATE_FILE"
}

@test "ask-user-format lists the four escalation criteria" {
  # The (a)-(d) forks that always warrant a question.
  grep -q 'contract' "$GATE_FILE"        # (a) public/observable contract
  grep -qi 'destructive\|reverse' "$GATE_FILE"   # (b) destructive/irreversible
  grep -qi 'workflow\|use-case' "$GATE_FILE"     # (c) un-inferable assumption
  grep -qi 'downstream cost' "$GATE_FILE"        # (d) material taste call
}

# ─── Story 2: the old absolutism is gone ───────────────────────────────────

@test "ask-user-format no longer carries the unconditional no-escape-hatch rule" {
  # The new phrasing scopes the escape hatch to genuine forks. Any line that
  # mentions an escape hatch (case-insensitive) must qualify it with "for
  # genuine forks"; the phrase being absent entirely is also acceptable.
  run grep -in 'no escape hatch' "$GATE_FILE"
  if [ "$status" -eq 0 ]; then
    while IFS= read -r line; do
      [[ "$line" == *"for genuine forks"* ]] || {
        echo "found unconditional no-escape-hatch line:"; echo "$line"; false
      }
    done <<< "$output"
  fi
}

@test "ask-user-format is self-contained: no unresolved template placeholders" {
  run grep -nE '\{\{[A-Z_]+\}\}' "$GATE_FILE"
  [ "$status" -ne 0 ] || { echo "found template placeholder:"; echo "$output"; false; }
}

# ─── Story 3: drift guard for the non-consuming review skills ───────────────

@test "eng-review and design-review point back to the gate source of truth" {
  # These two skills don't import {{ASK_USER_FORMAT}}; their inline classifiers
  # must cite the resolver so a future gate edit knows both exist.
  grep -q 'lib/resolvers/ask-user-format.md' "$ROOT/eng-review/SKILL.md.tmpl"
  grep -q 'lib/resolvers/ask-user-format.md' "$ROOT/design-review/SKILL.md.tmpl"
}
