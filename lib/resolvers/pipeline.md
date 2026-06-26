## Autonomous pipeline (orchestrator walk)

When `/begin` classifies the work as **feature/design work** (brainstorm mode),
it does not hand off once and stop. It becomes the **orchestrator**: it drives
the whole smriti chain — design → plan → review → build → review — pausing only
at the two human gates, then pinging you to ship.

This is a layer *on top of* the existing skills. Every downstream skill stays
**chain-agnostic**: the orchestrator invokes each via the `Skill()` tool exactly
as a user would, and the skills never know they're in a pipeline. Do **not** edit
a downstream skill to make it chain — all the orchestration lives here.

**Opt-out.** If the user says "just brainstorm" / "don't drive the whole thing"
(or the work is exploratory, `Mode = explore`), do the single `Skill(brainstorm)`
handoff and stop — skip the walk.

### The stage-table (the flow, as data)

The pipeline is this ordered table. The orchestrator walks it top-to-bottom.
`kind` drives the re-ground rule; `codex` notes which stages auto-offer a Codex
pass; `cond` stages run only when their condition holds (otherwise they're
marked `SKIPPED` and stepped over).

| # | stage | kind | codex | gate | cond |
|---|-------|------|-------|------|------|
| 1 | `brainstorm` | mutating | yes | — | — |
| 2 | `plan` | mutating | — | — | — |
| 3 | `plan-eng-review` | review-only | yes | — | — |
| 4 | `plan-design-review` | review-only | — | — | UI scope in the design doc |
| 5 | **approve-plan** | gate | — | HUMAN | — |
| 6 | `work` | mutating | — | — | — |
| 7 | `eng-review` | review-only | yes | — | — |
| 8 | `design-review` | review-only | — | — | UI files in the diff |
| 9 | **ping** | gate | — | HUMAN | — |

After the `ping` gate the user runs `/ship` and `/clean` themselves — the
pipeline deliberately stops before anything outward-facing.

The stage order mirrors the approvals pipeline (`bin/smriti-approvals` `SKILLS`),
so approvals state is a faithful map of where the walk is.

### Walk semantics — approvals state is the source of truth

Do **not** track "what stage am I on" from memory or conversation momentum —
that drifts over a long run. The single source of truth is the per-branch
approvals state:

```bash
smriti approvals get-json | jq -c .
```

**Next stage = the first stage in table order whose status is `NOT_YET_RUN`**,
skipping any `cond` stage whose condition does not hold (mark those `SKIPPED`
first, below). Because the next stage is *computed from persisted state*, the
walk is **resumable for free**: if this conversation dies mid-pipeline, re-running
`/begin` recomputes the same next stage and continues — no separate resume state.

Resolve conditional stages up front, once, right after the design doc exists:

```bash
# plan-design-review + design-review apply only to UI work.
# 'smriti approvals required' already encodes the design-review UI-diff rule;
# reuse it rather than inventing a second UI-detection path (Tier 1d).
smriti approvals required        # prints "eng-review" plus "design-review" iff UI diff
```

If a conditional stage does not apply, stamp it `SKIPPED` so the walk steps over
it and the approvals doc reads honestly:

```bash
smriti approvals set design-review SKIPPED --note "no UI files in scope"
```

The loop, in prose:

1. Compute the next stage from approvals state (above).
2. If it's a **gate**, hand control to the human (see the gate sections) and
   stop advancing until they answer.
3. Otherwise **re-ground** (below), run the stage's transition pre-check, invoke
   `Skill(skill="<stage>", args="<verbatim original request>")`, then run the
   post-check + emit the contract block.
4. Repeat until the `ping` gate.

### Re-ground before every mutating / review stage (hard requirement)

A long single-conversation run is where "confident but stale" mistakes live — a
review reading an old diff, a build re-fixing already-fixed code. Before any
`mutating` or `review-only` stage, re-anchor on the *current* tree, not on what
earlier stages said:

```bash
git status --short
git diff --stat
smriti approvals get-json | jq -c .
```

Gate stages don't mutate code, so they skip the re-ground.

### Stage-transition validator (don't advance on bad state)

Approvals state is necessary but **not sufficient** — a stage can finish with
plausible prose yet leave state inconsistent. Guard every transition:

**Pre-check (before invoking stage `S`):** every applicable stage *above* `S` in
the table must be in a terminal-good status — `APPROVED`, `CONDITIONAL`, or
`SKIPPED`. If any earlier stage is still `NOT_YET_RUN` or sits at `NEEDS_CHANGES`,
the walk is out of order: **stop and escalate to the human**, don't invoke `S`.

**Post-check (after stage `S` returns):** accept `S` as complete **only if both**
hold —

1. its approvals status moved out of `NOT_YET_RUN` to a legal terminal status
   (`APPROVED` / `CONDITIONAL` / `NEEDS_CHANGES` / `SKIPPED`); **and**
2. `S` emitted its **completion block** (below) naming the stage and outcome.

If either is missing, **do not advance** — stop and tell the user what's
inconsistent. Guessing forward on bad state is the failure mode this prevents.

### Per-stage completion block (the machine-checkable marker)

After each non-gate stage, emit exactly this block. It's both the human-readable
hand-off and the post-check's completion marker — keep the shape fixed:

```
▸ stage: <stage-id> → <APPROVED|CONDITIONAL|NEEDS_CHANGES|SKIPPED>
  objective:    <one line — what this stage was for>
  changed:      <files touched this stage, or "none (review/doc only)">
  open risks:   <one line, or "none">
  blocker:      <none | the blocking finding that needs the human>
  next:         <next stage-id, or "gate: approve-plan" / "gate: ping">
```

The orchestrator synthesizes this from git state + `smriti approvals get-json` —
the downstream skill does not produce it (that's what keeps skills chain-agnostic).
