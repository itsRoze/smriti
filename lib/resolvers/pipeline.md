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

**Walk the stage-table positionally**, top to bottom. For each row decide
"already done?" by the stage's `kind` — `work` and the two gates are **not** in
the approvals `SKILLS` array (`brainstorm plan plan-eng-review plan-design-review
eng-review design-review ship`), so you cannot read their status from approvals;
only the six review/doc stages have approvals entries.

| kind | "done?" signal |
|------|----------------|
| review/doc stage (`brainstorm`, `plan`, `plan-eng-review`, `plan-design-review`, `eng-review`, `design-review`) | approvals status is terminal-good (`APPROVED` / `CONDITIONAL` / `SKIPPED`) |
| `work` | the implementation commits exist on the branch (`git log` shows the plan's units) — work is deliberately *not* an approvals gate |
| gate (`approve-plan`, `ping`) | the human acted this session; on resume, inferred from downstream state (impl commits exist ⇒ the plan was approved) |

The next stage is the first row that isn't yet done. **Resumability:** the six
approvals-backed stages resume exactly from persisted state; `work` and the gates
are *inferred* from git + conversation, so resume across those edges is
best-effort, not exact.

Resolve each conditional stage **at its own position**, not all up front — the
two conditions become knowable at different times:

- **`plan-design-review`** (before the plan gate): applies when the design has
  **UI scope**. Judge that from the design doc / `DESIGN.md`; no diff exists yet.
  No UI scope → stamp it `SKIPPED`.
- **`design-review`** (after `work`): applies when the **diff** touches UI files.
  Only now does a diff exist, so reuse the existing UI-diff rule rather than a
  second detector (Tier 1d):

```bash
smriti approvals required        # post-work: prints "design-review" iff the diff has UI files
```

When a conditional stage does not apply, stamp it `SKIPPED` so the walk steps
over it and the approvals doc reads honestly:

```bash
smriti approvals set design-review SKIPPED --note "no UI files in the diff"
```

The loop, in prose:

1. Compute the next stage by walking the table positionally (above).
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
the table must be **done per its kind** (the done-signal table above) — terminal-
good approvals for review/doc stages, implementation commits for `work`, the human
having acted for gates. If an earlier stage isn't done, or a review stage sits at
`NEEDS_CHANGES`, the walk is out of order: **stop and escalate to the human**,
don't invoke `S`.

**Post-check (after stage `S` returns):** accept `S` as complete **only if both**
hold —

1. its **done-signal fired** — for a review/doc stage, approvals moved out of
   `NOT_YET_RUN` to a legal terminal status (`APPROVED` / `CONDITIONAL` /
   `NEEDS_CHANGES` / `SKIPPED`); for `work`, the plan's unit commits now exist on
   the branch; **and**
2. `S` emitted its **completion block** (below) naming the stage and outcome.

If either is missing, **do not advance** — stop and tell the user what's
inconsistent. Guessing forward on bad state is the failure mode this prevents.

### Per-stage completion block (the machine-checkable marker)

After each non-gate stage, emit exactly this block. It's both the human-readable
hand-off and the post-check's completion marker — keep the shape fixed:

```
▸ stage: <stage-id> → <APPROVED|CONDITIONAL|NEEDS_CHANGES|SKIPPED|BUILT>
  objective:    <one line — what this stage was for>
  changed:      <files touched this stage, or "none (review/doc only)">
  open risks:   <one line, or "none">
  blocker:      <none | the blocking finding that needs the human>
  next:         <next stage-id, or "gate: approve-plan" / "gate: ping">
```

The orchestrator synthesizes this from git state + `smriti approvals get-json` —
the downstream skill does not produce it (that's what keeps skills chain-agnostic).

### Gate 1: approve the plan (interactive HTML card loop)

Once the plan is locked (`plan-eng-review` — and `plan-design-review` when it
applies — are terminal-good), present the plan for approval as an **interactive
HTML view**, not a wall of markdown. Reuse the review-loop transport described
in the HTML-render resolver (`serve` → `await` → `render` → `stop`) — same
machinery `/plan-eng-review` uses, so there's one obvious way to do this
(Tier 1d).

Map the plan to a spec: **one card per Implementation Unit**, in a single
`Implementation Units` section. Each card's `body_md` is the unit's Goal +
Approach in brief; the card id is the U-ID (`u1`, `u2`, …) so edits round-trip
to a stable identity. The canonical spec schema lives in `bin/smriti-html`
(required: `title`, `skill`, `session_id`, `revision_id`, `source_hash`,
non-empty `sections`; each card needs `id`, `title`, `body_md`). Set
`global_notes_prompt` to invite overall direction.

The loop:

1. Build the spec, `source_hash` over the plan doc. `smriti html serve <spec>` —
   capture the `session_id`.
2. `smriti html await --session <id>` — block for the user's decisions.
3. Read the payload:
   - A card `reject`/`edit` (or `global_notes`) → revise that unit in the plan
     **markdown** (source of truth), bump `revision_id`, `smriti html render
     --session <id> <next-spec>`, and re-await.
   - `action: finish` → the plan is approved. `smriti html stop --session <id>`
     and advance to the `work` stage.
4. **Block-with-fallback** (per the HTML-render resolver): if the server is
   unreachable or the user ignores the browser, fall back to a single
   AskUserQuestion — *approve the plan / request revisions* — so the gate is
   never a hard stop.

Approval here is a **human checkpoint**, not an approvals-key transition — the
plan key was already stamped by `/plan`. Re-grounding doesn't apply (a gate
mutates nothing).

### Repair loop (one bounce per review class, then escalate)

A `review-only` stage that returns `NEEDS_CHANGES` is a real blocker, not a
suggestion. Route it back **once**:

- `plan-eng-review` → `NEEDS_CHANGES`: bounce to `Skill(plan)` to revise the
  plan, then re-run `Skill(plan-eng-review)`.
- `eng-review` / `design-review` → `NEEDS_CHANGES`: bounce to `Skill(work)` to
  address the findings, then re-run that same review.

Track the bounce count **per review class** in-conversation. If the review is
*still* `NEEDS_CHANGES` after one bounce, **stop and escalate to the human** with
the blocking finding — do not loop a second time. Mechanical/auto-fixable
findings are handled inside the review stage itself (its severity-gated posture);
the repair loop is only for the blocking remainder.

### Gate 2: ping — stop before ship

When `work` is done and `eng-review` (plus `design-review` when it applied) are
terminal-good, the autonomous run is over. Emit the final completion block, then
a short ping and **stop**:

```
✅ pipeline complete — implementation built and reviewed on <branch>.
   <N> units landed · eng-review <status>· design-review <status|skipped>
   Next (you drive): /ship to ship, then /clean after it merges.
```

Default ping is this stop-and-print hand-off (no push-notification dependency).
Do **not** auto-invoke `/ship` or `/clean` — shipping is outward-facing and stays
in the user's hands by design.

