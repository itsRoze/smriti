#!/usr/bin/env bats
bats_require_minimum_version 1.5.0
# Tests for the autonomous /begin pipeline (lib/resolvers/pipeline.md wired into
# begin/SKILL.md.tmpl). The generated begin/SKILL.md is gitignored, so these
# tests regenerate it from the template before asserting on its content.
# Run via: bun run test   (which shells out to scripts/run-tests.sh)

setup() {
  ROOT="$BATS_TEST_DIRNAME/../.."
  HTML="$ROOT/bin/smriti-html"
  FIXTURES="$BATS_TEST_DIRNAME/fixtures"
}

# ─── Resolver is wired + generated SKILL.md carries the pipeline ─────────────

@test "skill:check passes (the {{PIPELINE}} placeholder resolves)" {
  run bun "$ROOT/scripts/skill-check.ts"
  [ "$status" -eq 0 ]
}

@test "gen:skill-docs regenerates begin/SKILL.md with the pipeline wired" {
  run bun "$ROOT/scripts/gen-skill-docs.ts"
  [ "$status" -eq 0 ]
  [ -f "$ROOT/begin/SKILL.md" ]

  # Stage-table + walk + both gates + the re-ground discipline made it in.
  grep -q "Autonomous pipeline (orchestrator walk)" "$ROOT/begin/SKILL.md"
  grep -q "stage-table" "$ROOT/begin/SKILL.md"
  grep -q "Gate 1:" "$ROOT/begin/SKILL.md"
  grep -q "Gate 2:" "$ROOT/begin/SKILL.md"
  grep -q "Re-ground before every mutating / review stage" "$ROOT/begin/SKILL.md"
  grep -q "Stage-transition validator" "$ROOT/begin/SKILL.md"
}

@test "approvals-state is the documented source of truth for the walk" {
  bun "$ROOT/scripts/gen-skill-docs.ts" >/dev/null
  grep -q "smriti approvals get-json" "$ROOT/begin/SKILL.md"
  grep -q "source of truth" "$ROOT/begin/SKILL.md"
}

# ─── No routing path regressed when the pipeline branch was added ────────────

@test "debug, work, and implement routing survive the regen" {
  bun "$ROOT/scripts/gen-skill-docs.ts" >/dev/null
  grep -q "Mode: debug" "$ROOT/begin/SKILL.md"
  grep -q "Mode: work" "$ROOT/begin/SKILL.md"
  grep -q "Mode: implement" "$ROOT/begin/SKILL.md"
  # The one-shot-handoff language stays on debug/work, not on the brainstorm path.
  grep -q "The debug skill takes over entirely" "$ROOT/begin/SKILL.md"
  grep -q "The work skill takes over entirely" "$ROOT/begin/SKILL.md"
}

# ─── The plan→card mapping stays valid against the canonical html schema ─────

@test "fixture plan-spec validates against the html schema (check-spec exits 0)" {
  run bun "$HTML" check-spec "$FIXTURES/plan-spec.json"
  [ "$status" -eq 0 ]
  [[ "$output" == *"ok"* ]]
}
