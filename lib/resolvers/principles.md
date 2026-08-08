# Coding principles

This file is the authoritative behavior guide for code written in any project that imports it. It is auto-loaded into Claude Code via the `@`-import in the project's `CLAUDE.md`, and injected into smriti's review skills as explicit criteria. When you write code, follow it. When you review code, cite it.

## How to read this file

Principles are organized into tiers. The conflict ladder is the master rule:

1. **When two principles conflict, the lower-numbered tier wins.**
2. **Within a tier, the more specific rule wins.**
3. **Smells are diagnoses, not principles.** Cite them as evidence of a Tier 1 or Tier 2 violation, never as rules in their own right.

Tier 1 is a hard gate — review must block on a violation. Tier 2 is a strong preference — review flags it but may waive with a reason. Tier 3 is a tie-breaker, used only when Tiers 1 and 2 are silent.

---

## Tier 1 — Optimize for AI

All implementation work in this codebase is done by AI (Claude). Tier 1 captures the four behaviors that most directly reduce Claude's cost-per-edit. A violation here is a hard gate — review blocks until resolved.

### 1a. Searchability

One term per concept. If the same idea appears under three names, grep returns three different sets and the model will blend them.

- **Comply:** the concept "user identifier" is `userId` everywhere — never also `uid`, `userID`, `user_id`, or `accountId`-when-we-meant-userId.
- **Violate:** mixing `userId` and `uid` in the same module. Mixing `fetchUser` and `getUser` for the same operation. Inventing new terms for existing concepts.
- **Apply when reviewing:** grep a key term from the diff. If you find sibling files using a different word for the same thing, that is a Tier 1 violation.

### 1b. Locality

A feature is one-hop discoverable. From a single grep on a meaningful term, OR from reading one file's imports, the reader (Claude) can reach every file the feature touches.

- **Comply:** an authentication flow lives in two or three files referenced from a single `auth/` directory or single import line.
- **Violate:** a feature that requires reading interface A, then implementation B, then registry C, then plugin D, then config E to understand what runs.
- **Note:** "one-hop" is the invariant, not "one or two files." Plenty of features legitimately span more files than that. The test is whether the file tree reveals the feature in one hop, not how many files end up in the count.

### 1c. Explicit over implicit

No metaprogramming, dynamic dispatch by string, runtime monkey-patching, or auto-registration magic. The reader reads what runs.

- **Comply:** functions are called by name; tools are listed in an explicit array; routes are declared in one file.
- **Violate:** decorators that scan the filesystem and auto-wire handlers; magic-method dispatch by string lookup; module imports that mutate global state as a side effect; "convention over configuration" that hides what actually runs.
- **Apply when reviewing:** if the answer to "what runs when X happens?" requires reading framework internals, that's a Tier 1 violation.

### 1d. Consistency — one obvious pattern per task

For any given job in this codebase, there is one obvious way to do it. Different ways for the same job invite the model to find three examples and blend them, producing a fourth pattern that exists nowhere else.

- **Comply:** CLI helpers in `bin/` are bash by default, with one stated exception — bun/TypeScript when the job needs a runtime bash cannot supply (a browser for `smriti-browse`, an HTTP server for `smriti-html`, raw-mode TTY input for `smriti-factory`) — and all of them share the same option-parsing shape. All resolvers in `lib/resolvers/` are flat markdown files. All skill templates use a single placeholder syntax — the one the build-time resolver expands — never two competing syntaxes.
- **Violate:** half the CLI helpers are bash, half are TypeScript, with no clear rule when to use which. Two ways to read project config (`cat` vs a `bin/` helper) coexisting.
- **Apply when reviewing:** if the diff introduces a second pattern for a job that already has a pattern, that's a Tier 1 violation. Either migrate the old pattern, or the diff must justify why this is genuinely a different job.

---

## Tier 2 — User preferences

Strong preferences. Review flags violations but can waive when a Tier 1 concern outranks the Tier 2 rule, or when a documented exception applies. Each rule has a "comply" example and a "watch for" failure mode.

### 2.1. Reduce complexity. Keep things simple.

Prefer the simpler option that meets the actual requirement. Do not add features, abstractions, or error-handling for hypothetical futures.

- **Watch for:** factories that wrap one concrete; configuration knobs no caller sets; error paths that handle conditions the upstream code prevents.

### 2.2. Leave the garden better than you found it — bounded by review effort

You are invited to clean up code you read while doing the actual task. Same-feature scope. The bound is review effort, not file count.

- **Comply:**
  - Renaming a variable across many files is fine because the change shape is small (one operation, mechanical, cheap to QA).
  - Fixing a typo or dead code in the file you are already editing is fine.
- **Watch for:**
  - Multi-line logic changes across 4 or more files in service of cleanup. That belongs in its own PR.
  - Refactors triggered by "while I'm here" that double the diff and turn one feature PR into a feature-plus-cleanup mixed bag. Bisect cries; review takes twice as long.
- **Apply when reviewing:** if cleanup pushes the diff past "I can hold this in my head," it's a Tier 2 violation — split it.

### 2.3 + 2.4. Explanatory variables and descriptive, searchable names

Names are the user interface for code. Make them so good that a comment isn't needed.

- **Comply:** `attemptsBeforeBackoff = 3`, not `const N = 3`. `findUserByEmail`, not `find`. Magic numbers replaced with named constants whose name explains the intent.
- **Watch for:** single-letter variables outside tight numeric loops; abbreviations that are not industry-standard; names that describe HOW the value is computed instead of WHAT it represents.

### 2.5. Small functions. One thing each. Few arguments.

A function does one thing, named after that thing. Maximum two positional arguments; past two, take an options object — but only when the call site actually benefits from naming the args. Don't introduce an options object solely to dodge the count.

- **Comply:** `parseUserInput(raw, options)` where `options.allowEmpty`, `options.maxLength` make call sites readable.
- **Watch for:** options objects with two fields that are always passed together — that's just two positional args wearing a hat.

### 2.6. Comments only for intent, clarification, or warning

If a comment restates what well-named code already says, delete it. Comments earn their place by explaining WHY, flagging a non-obvious constraint, or warning of a consequence.

- **Comply:** `// node_modules ships symlinks; readlink before stat or you'll loop`
- **Watch for:** `// loop over users` above `for (const user of users)`. `// validate input` above a function literally named `validate`.

### 2.7. Facade pattern for integrations — only on second consumer

When you are integrating with an external service or vendor, the *default* is to call the vendor's API directly. Extract a facade only when one of these is true:

- **A second concrete consumer exists today** (not "might exist later") that needs the same wrapping; OR
- **The current change would otherwise spread vendor-specific assumptions across multiple call sites in this PR** (e.g., the diff already touches three places that all need the same sanitization).

Don't pre-build a vendor-swap abstraction for a swap that hasn't been planned. If the swap actually happens, the second consumer will tell you exactly what shape the abstraction should be.

- **Apply when reviewing:** a new `FooService` interface with one implementation and one caller is a Tier 2 violation. Inline it until the second consumer arrives.

### 2.8. Code reads like a narrative

This is a Tier 3 tie-breaker (see below), not a Tier 2 rule. Listed here for discoverability — it has been moved.

### 2.9. Tests are meaningful — readable, fast, independent, repeatable

Tests must read like a specification of the behavior under test, not a thin wrapper around the implementation. Each test is independent (no shared mutable state across tests), repeatable (same inputs produce same outputs every run), and fast enough that the suite runs without coffee breaks.

- **Comply:** test names describe the behavior, not the function. Setup uses fresh fixtures per test. No sleeps; no real network.
- **Watch for:** tests that pass when the code is wrong because they assert on implementation details (e.g., "calls method X" instead of "produces result Y"). Shared fixtures mutated across tests. Tests requiring network access or specific filesystem state.

---

## Tier 2b — Cleanup scope rule (operationalizes Tier 2.2)

When you are tempted to clean something up while implementing the task at hand:

| Change shape | Verdict |
|---|---|
| Rename across any number of files | OK — the change shape is mechanical and cheap to QA |
| Logic change in one file you're already editing | OK |
| Logic change across 2 or 3 adjacent files in the same feature | OK if the connection is obvious |
| Logic change across 4 or more files | Stop. Open a separate PR. |

The threshold is review/QA effort, not literal file count — the table is a heuristic. If a 5-file rename is mechanical (`s/oldName/newName/g`) the rename PR is cheap; if a 3-file change requires understanding three different control flows, it's already big. Trust the budget, not the row.

---

## Tier 3 — Tie-breakers

Tier 3 rules apply only when Tiers 1 and 2 are silent — i.e., two structures are equally searchable, local, explicit, consistent, simple, and well-named. In that rare case, prefer the one that:

### 3.1. Reads like a narrative

When two implementations both pass Tier 1 and Tier 2, prefer the one whose top-to-bottom order matches the order a reader would naturally ask questions.

- **Comply:** a function that does setup, then the main operation, then teardown reads in that order in the file.
- **Note:** this does NOT override Tier 1 locality. If reading top-to-bottom would mean spreading a feature across more files, locality wins. Narrative is a tie-breaker, not a constraint.

---

## Smell appendix — diagnoses, not rules

These are common failure modes, named for cite-ability when surfacing a Tier 1 or Tier 2 violation. Do not cite a smell as a rule on its own — always pair it with the principle it violates.

- **Rigidity** — a small change cascades through many unrelated files. Usually a Tier 1c (explicit) or Tier 2.5 (small functions) violation.
- **Fragility** — a single change breaks behavior in several seemingly unrelated places. Usually a Tier 1b (locality) or Tier 1d (consistency) violation.
- **Immobility** — a piece of code can't be reused in another context without dragging in the rest of the system. Usually a Tier 2.5 (one thing each) or Tier 2.7 (premature facade) violation.
- **Opacity** — the code is hard to understand on first read. Usually a Tier 2.3/2.4 (naming) or Tier 2.6 (missing why-comments) violation.

When citing, write `Tier 1b (locality) — fragility evidence: change to X broke unrelated tests in Y and Z.` The smell labels what you observed; the principle says why it's a problem.

---

## How review uses this file

smriti's native `/code-review` reads this file as structured criteria, and `/begin` follows it while implementing. For each finding:

1. Identify the tier and rule violated (e.g., Tier 1b, Tier 2.7).
2. Cite the rule by name in the finding text.
3. Treat Tier 1 violations as blocking; Tier 2 as flag-and-decide; Tier 3 only when nothing higher applies.
4. If the diff genuinely needs to violate a Tier 2 rule, the rationale must be in the PR description or a code comment — silent waivers are a process violation.

## How implementation uses this file

When you write code in any project that imports this file:

1. Treat Tier 1 as a hard constraint — never violate without surfacing the conflict to the user first.
2. Treat Tier 2 as the default — follow it unless a Tier 1 concern requires deviating, and explain the deviation in the PR description.
3. Don't optimize for Tier 3 unless 1 and 2 are silent.
4. Don't cite smells as rules — pair them with a tier when surfacing concerns.
