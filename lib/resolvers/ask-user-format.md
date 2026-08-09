## AskUserQuestion format (decision brief)

**Every `AskUserQuestion` in this skill follows this shape. Every element is non-skippable. If you find yourself about to drop one, stop and back up.**

### Cadence — read this first

**Triage every finding by stakes before deciding whether to ask.** Not every finding is the user's to adjudicate. Most are low-stakes calls you should make yourself and report; a few are genuine forks that need the user. Sort each finding into one of two buckets:

- **Auto-resolve (low stakes)** — mechanical, reversible, or a taste call with no material downstream cost. Pick the best default, apply it, and record a one-line entry in the run digest (below). Do **not** raise an AskUserQuestion. Do not manufacture a question to look thorough — a low-stakes question wastes the user's time and slows the work.
- **Escalate (genuine fork)** — raise a full decision brief (shape below) **only** when the finding:
  - **(a)** changes a public or observable contract / interface, or
  - **(b)** is destructive or hard to reverse, or
  - **(c)** hinges on a use-case, workflow, or product assumption you cannot verify from `PROJECT.md`, the design/plan doc, or learnings, or
  - **(d)** is a taste call with material downstream cost (rework, lock-in, user-visible behavior change).

  One genuine fork, one question, one at a time — never batched. The user sees one decision, decides, then sees the next. (Batching collapses distinct forks into a single report — gstack measured the model doing exactly this on Opus 4.7 when the rule isn't said outright.)

**No escape hatch for genuine forks.** A finding that meets (a)–(d) always gets its own brief, even when the fix looks obvious — the user owns that call. The escape hatch is *only* for low-stakes findings, which auto-resolve into the digest. A section with genuinely zero findings gets a *"No issues, moving on."* and you proceed.

### Run digest — the user's review checkpoint

At the end of the skill, surface what you decided on the user's behalf so they can review in one pass instead of adjudicating each step:

```
Decided N low-stakes calls for you:
  - <one line each: what you found, what you chose>
Escalated M genuine forks: <titles, or "none">
```

The digest is **non-negotiable whenever you auto-resolved anything** — silently deciding without reporting removes the user's ability to catch a call they'd have made differently. It is also the anti-laziness guard that the old "ask about everything" rule used to provide: enumerating every auto-resolved call forces you to actually surface them, not skip them. One sentence per line.

### Required shape

```
D<N> — <one-line question title>

ELI10: <plain English a smart 16-year-old could follow, 1–2 sentences. What's actually being decided.>

Stakes if we pick wrong: <one sentence on what concretely breaks — pain avoided, capability lost, user-visible consequence>

Recommendation: <Option X> because <one-line reason>

Completeness: A=X/10, B=Y/10
   (or, when options differ in kind:
    Note: options differ in kind, not coverage — no completeness score.)

Option A — <name> (recommended)
  ✅ <pro — concrete, observable, ≥40 chars>
  ✅ <pro>
  ❌ <con — honest, ≥40 chars>

Option B — <name>
  ✅ <pro>
  ✅ <pro>
  ❌ <con>

Net: <one-sentence verdict frame — what you're actually trading off>
```

### Element rules

1. **D-numbering.** First question in a skill invocation is `D1`. Increment per question within the same skill. You count your own questions — there is no runtime counter. Drift over a long session is fine; minor inconsistency is not a bug. If a nested skill runs (e.g., `/begin` consulting `frontend-design`), it starts its own `D1`; disambiguate as `D1 (frontend-design)` so the user can refer back unambiguously.

2. **ELI10 (always).** Plain English, concrete examples, no function names. Say what it *does*, not what it's *called*. Even if the user is technical, even in terse mode — they're about to make a decision and need context they may not have loaded.

3. **Stakes if we pick wrong (always).** One sentence naming what breaks in concrete terms. *"Users see a 3-second spinner on first paint"* beats *"performance may degrade."* Forces the trade-off to be real instead of vibes.

4. **Recommendation (always, even when neutral).** `Recommendation: <Option X> because <one-line reason>` on its own line. Never omit it. The `(recommended)` label on the option STAYS — even on neutral-posture questions where you genuinely don't have a preference. Treat the label as a machine-readable hint that future tooling (AUTO_DECIDE-style flows) may rely on; defensive coding now is cheap.

   **Neutral posture.** When this is genuinely a taste call (kind-differentiated choices where neither side dominates, two architectures both viable, two design directions both legitimate), the Recommendation line reads:

   ```
   Recommendation: Option A — this is a taste call, no strong preference either way
   ```

   The `(recommended)` label still goes on Option A. The *"taste call"* prose is the human-readable neutrality signal. Both coexist.

5. **Completeness (when meaningful).** Compose with `lib/resolvers/completeness-rubric.md`:
   - **Coverage-differentiated** options (full test coverage vs happy path, complete error handling vs partial) → score each `Completeness: N/10` per the rubric. Flag any option ≤5 where a higher-completeness option exists.
   - **Kind-differentiated** options (architecture A vs B, mode X vs Y, posture-over-posture) → no scores. Add the line: `Note: options differ in kind, not coverage — no completeness score.`

   **Do not fabricate scores.** Filler `10/10` on every option is worse than no score. gstack hit this exact bug — Opus 4.7 invented `10/10` filler when the metric didn't fit. If the options differ in kind, say so.

6. **Pros / cons.** Every option gets ✅ (pro) and ❌ (con) bullets:
   - **Minimum 2 ✅ + 1 ❌ per option.** If you can't name a con for the recommended option, the recommendation is hollow — go find one. If you can't name a pro for the rejected option, the question isn't real.
   - **Minimum 40 characters per bullet.** `✅ Simple` is not a pro. `✅ Reuses the plan-doc JSONL format already parsed by smriti latest-doc, zero new parser` is. Concrete, observable, specific.
   - **Hard-stop escape** for genuinely one-sided choices (one-way doors, destructive-action confirmations): a single bullet `✅ No cons — this is a hard-stop choice` satisfies the rule. Use sparingly; overuse turns the brief into theater.

7. **Net line (always).** Closes the decision with a one-sentence synthesis of what the user is actually trading off. Not a summary — a verdict frame. Examples: *"Speed now vs maintainability later."* / *"Coverage we'll regret skipping vs coverage we'll regret writing."* / *"The boring option ships; the interesting option teaches."*

8. **Effort (when an option involves effort).** Show **Claude Code time only** — drop human-time estimates. Examples:
   - `(CC: ~15 min)` — single-pass change
   - `(CC: ~45 min — investigate ~10, scaffold ~15, tests ~15, review ~5)` — multi-phase, when the phase breakdown clarifies the estimate
   - `(CC: ~2 sessions)` — when the work crosses a context window and the session count is the real cost

   Honest ranges are fine when the work is exploratory: `(CC: ~30–60 min, depends on what we find in step 2)`. Don't pad with false precision.

9. **Tool call, not prose.** A markdown block titled `Question:` is *not* a question — the user never sees it as interactive. If you find yourself writing one, stop and reissue as an actual `AskUserQuestion` tool call. The rich markdown above goes in the question body; the `options` array stays short labels (`A) <name>`, `B) <name>`).

### Self-check before emitting

Before calling AskUserQuestion, verify:

- [ ] D<N> header present
- [ ] ELI10 paragraph present
- [ ] Stakes-if-we-pick-wrong line present
- [ ] Recommendation line present with concrete reason
- [ ] Completeness scored (coverage) OR kind-note present (kind) — never both, never fabricated
- [ ] Every option has ≥2 ✅ and ≥1 ❌, each ≥40 chars (or hard-stop escape)
- [ ] `(recommended)` label on exactly one option (even for neutral-posture)
- [ ] Net line closes the decision
- [ ] You are calling the tool, not writing prose
- [ ] Effort, if shown, is CC-time only (no human-time line)

If you'd need to read the source to understand your own ELI10, simplify before emitting.
