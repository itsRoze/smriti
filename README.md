# smriti

> **स्मृति** — Sanskrit for *memory; that which is remembered.*

A personal Claude Code skill stack — opinionated, learns across sessions, gets smarter on each codebase over time. Inspired by [gstack](https://github.com/garrytan/gstack), slimmed down for solo use.

---

## Contents

- [The pipeline](#the-pipeline)
- [Approval gates](#approval-gates)
- [Install](#install)
- [What a session looks like](#what-a-session-looks-like)
- [Architecture](#architecture)
- [Configuration](#configuration)
- [Managing tracked projects](#managing-tracked-projects)
- [Principles](#principles)
- [Browser audit](#browser-audit-design-review-v2)
- [Interactive HTML specs](#interactive-html-specs)
- [What's deferred (v0.2 / later)](#whats-deferred-v02--later)
- [Acknowledgments](#acknowledgments)
- [License](#license)

## The pipeline

Each skill produces an artifact the next one reads. Run them in order; downstream skills know what came before.

```
   ENTRY        THINK            PLAN                              BUILD       REVIEW                   SHIP
   ─────        ─────            ─────                             ─────       ─────                    ────
                                        ┌─ /plan-eng-review     ─┐              ┌─ /eng-review     ─┐
/begin → /bootstrap → /brainstorm → /plan →                     →  /work →                          → /ship → (merge) → /clean
           │                            └─ /plan-design-review  ─┘              └─ /design-review  ─┘
           ├─ /debug
           ├─ /work  (when a plan exists)
           └─ (implement)      /design-consultation                          /learn  (anytime)
```

| Stage | Skill | Writes |
|-------|-------|--------|
| Entry | `/begin` | Routes to `/brainstorm`, `/debug`, `/work`, or implement fast path |
| Think | `/bootstrap` | `PROJECT.md` (one-time per repo) |
| Think | `/design-consultation` | `DESIGN.md` + self-contained HTML preview |
| Think | `/brainstorm` | `~/.smriti/projects/<slug>/<branch>-design-<ts>.md` |
| Plan | `/plan` | `~/.smriti/projects/<slug>/<branch>-plan-<ts>.md` (unit-by-unit) |
| Plan | `/plan-eng-review` | Engineering Review Decisions section in plan doc (findings as an [interactive HTML triage loop](#interactive-html-specs)) |
| Plan | `/plan-design-review` | Design Review Decisions section + 0–10 scores |
| Build | `/work` | The code — incremental per-unit commits |
| Review | `/eng-review` | Auto-fixes + entries in `reviews.jsonl` |
| Review | `/design-review` | Atomic `style(design):` commits + audit report (+ optional rendered audit via `smriti browse`) |
| Ship | `/ship` | Tests, version, CHANGELOG, bisectable commits, PR |
| Tidy | `/clean` | Post-merge: checkout default, pull, delete merged branch(es), prune |
| Debug | `/debug` | `~/.smriti/projects/<slug>/<branch>-debug-<ts>.md` |
| Memory | `/learn` | `~/.smriti/projects/<slug>/learnings.jsonl` |

## Approval gates

Each review skill stamps its verdict at the top of the design doc. `/ship` reads the stamps and warns when required gates are missing.

```
## Approvals

- ✅ /brainstorm       — 2026-04-26 — mode: users; rec: Option 2
- ✅ /plan              — 2026-04-26 — 5 units; 2 parallel groups
- ✅ /plan-eng-review    — 2026-04-26 — lean: senior; 0 unresolved
- ⚠️ /plan-design-review — 2026-04-26 — avg 8.2/10; 1 deferred
- ✅ /eng-review         — 2026-04-26 — 3 findings; 2 auto-fixed
- ➖ /design-review      — 2026-04-26 — no UI files in diff
- ⏸ /ship               — not yet run
```

| Icon | Status | Meaning |
|------|--------|---------|
| ✅ | APPROVED | gate passed cleanly |
| ⚠️ | CONDITIONAL | passed with deferred items (debt accepted) |
| ❌ | NEEDS_CHANGES | blocking issues — must revise |
| ➖ | SKIPPED | not applicable (e.g., no UI scope) |
| 🔄 | STALE | approved, plan changed since (manual for v0.1) |
| ⏸ | NOT_YET_RUN | gate hasn't fired |

`/ship` requires `eng-review` always; `design-review` when UI files are in the diff. The rest are recommended, not required. State at `~/.smriti/projects/<slug>/<branch>-approvals.json`.

## Install

Requires [Claude Code](https://docs.anthropic.com/en/docs/claude-code), [Bun](https://bun.sh) ≥ 1.0, [Git](https://git-scm.com), [jq](https://jqlang.github.io/jq/), and optionally [`gh`](https://cli.github.com) for `/ship`'s GitHub path. To run the test suite (`bun run test`): [bats-core](https://github.com/bats-core/bats-core) (`brew install bats-core`).

```bash
git clone https://github.com/itsRoze/smriti.git ~/.claude/skills/smriti
cd ~/.claude/skills/smriti
./setup
```

`setup` symlinks each skill into `~/.claude/skills/<name>/` and the `smriti` umbrella dispatcher into `~/.local/bin/smriti`. All CLI helpers are accessed via `smriti <command>`. To update later: `git pull && ./setup`.

## What a session looks like

```
You:    /bootstrap

Claude: SLUG: itsroze-myapp     BRANCH: main     IS_FIRST_TIME: yes
        Pre-filling from package.json + README + git log...

        [single bundled AskUserQuestion: project type / target user /
         lean / tech stack / deploy target / design priority]

        Wrote PROJECT.md. Logged 1 architecture learning.
        Recommend /design-consultation next (design priority = high).

You:    /brainstorm

Claude: Phase 1 — context loaded.
        Phase 2 — what's the goal here?
          [users / learn / prototype / intrapreneur / explore]

You:    users

Claude: Phase 3 (4 of 4 forcing questions, one at a time):
        "What evidence do you have that someone wants this?"
        ...
        Phase 5 — Three options:
          Option 1 (minimal viable): human ~6h / Claude ~25min, Completeness 6/10
          Option 2 (ideal):          human ~3d / Claude ~2h,    Completeness 9/10
          Option 3 (lateral):        human ~1w / Claude ~4h,    Completeness 9/10

        Recommendation: Option 2 — your evidence is strong enough to
        justify the bigger build, and lean=senior says don't ship the
        shortcut.

        Phase 6 — Get an independent Codex second opinion? [Y/skip]

[...design doc written; approval stamped; handoff to /plan]
```

## Architecture

```
~/.claude/skills/smriti/                   ← code (this repo)
├── bin/                                     # smriti (umbrella dispatcher) + smriti-{slug,config,project,learnings-*,codex-probe,update-check,approvals,version-bump,pr-title-rewrite,browse,principles-install,changelog-insert,latest-doc}
├── lib/resolvers/                           # {{PLACEHOLDER}} content (preamble, rubric, hard-rules, principles, etc.)
├── scripts/                                 # gen-skill-docs.ts, skill-check.ts, run-tests.sh + test/*.bats + test/*.test.ts
├── eng-review/checklist.md                  # the artifact /eng-review reads
└── <skill>/SKILL.md.tmpl                    # one per skill (generated SKILL.md is gitignored)

~/.local/bin/smriti                        ← umbrella dispatcher (symlink → bin/smriti)

~/.smriti/                                 ← runtime state (never versioned)
├── config                                   # global k=v: lean, codex_default, …
├── slug-cache/<sha>                         # path → slug mapping (absence = "first-time" trigger)
└── projects/<slug>/
    ├── learnings.jsonl                        # append-only, decay-aware
    ├── reviews.jsonl                          # one entry per review run
    ├── <branch>-approvals.json                # per-branch approval state
    ├── <branch>-design-<ts>.md                # design docs (one per /brainstorm run)
    ├── <branch>-plan-<ts>.md                  # implementation plans (one per /plan run)
    ├── <branch>-debug-<ts>.md                 # debug summaries (one per /debug run)
    ├── audit-urls.txt                         # /design-review v2 — URLs to audit (in smriti state, not project repo)
    ├── auth-state.json                        # /design-review v2 — Playwright storageState (mode 0600, never committed)
    ├── audits/<branch>-<ts>/                  # /design-review v2 — screenshots, ARIA snapshots, audit.json per URL
    └── design-audit-<ts>.md                   # /design-review reports

<your-repo>/
├── PROJECT.md                              # /bootstrap output (committed)
├── DESIGN.md                               # /design-consultation output (committed)
├── CLAUDE.md                               # @-imports lib/resolvers/principles.md from smriti install
└── TODOS.md                                # cross-referenced by every review skill
```

## Configuration

`smriti config get|set|unset|list` writes to `~/.smriti/config`.

| Key | Values | Default | Effect |
|-----|--------|---------|--------|
| `lean` | `senior` / `prototype` | `senior` | review depth — `senior` insists on failure-mode coverage; `prototype` ships rough |
| `codex_default` | `on` / `ask` / `off` | `ask` | whether `/brainstorm` and `/plan-eng-review` auto-prompt for a Codex second opinion |
| `browse_enabled` | `true` / `false` | (asked at `./setup`) | enables `/design-review` v2 rendered-audit step via `smriti browse` (Playwright) |
| `proactive` | `true` / `false` | `true` | reserved (proactive skill suggestions) |
| `explain_level` | `default` / `terse` | `default` | reserved (output verbosity) |
| `persona_threshold` | `<int>` (insertions) | `400` | `/eng-review` fans out parallel persona reviewers when a diff's insertions exceed this; smaller diffs use the single-agent pass |

## Managing tracked projects

`smriti project` owns the *set* of projects under `~/.smriti/projects/` — per-project content (learnings, approvals, designs) is managed by the skills themselves.

| Command | Purpose |
|---------|---------|
| `smriti project new <name>` | scaffold a new project directory with `git init`; print next-step guidance |
| `smriti project list` | every tracked project: slug, last-used, learnings count, designs count, source path |
| `smriti project current` | slug for `$PWD` (same value the preamble exposes as `SLUG`) |
| `smriti project forget <slug> [--yes]` | delete the project dir AND every slug-cache file pointing at it — interactive confirm unless `--yes`. In-repo `PROJECT.md` / `DESIGN.md` are git-tracked and not touched. |
| `smriti project rename <old> <new>` | rename a project slug — moves state dir + updates all slug-cache entries pointing at the old slug |

`forget` deletes both the project dir and the slug-cache entry; without the second step the next `cd` into the repo resurrects the same slug.

## Principles

`lib/resolvers/principles.md` is the authoritative coding-principles file shared across every project that opts in. Tier 1 (hard gates) operationalizes "optimize for AI" as four behaviors — searchability, locality, explicitness, consistency. Tier 2 captures user preferences (small functions, descriptive names, facade only on second consumer, etc.). Tier 3 is a narrative tie-breaker. A smell appendix names common failure modes (rigidity, fragility, immobility, opacity) for cite-ability in review findings.

**Two consumers, one source of truth:**

- **Write-time:** the project's `CLAUDE.md` `@`-imports the file, so Claude Code auto-loads the principles at session start in any repo that's installed.
- **Review-time:** `/eng-review` and `/plan-eng-review` inject `{{PRINCIPLES}}` directly into their generated `SKILL.md`, treating the principles as explicit criteria — every finding cites a tier and rule.

When you edit `lib/resolvers/principles.md`, every project that imports it picks up the change on the next Claude Code session. No per-project sync.

### Install in a project

```bash
smriti principles-install
```

Idempotent. Adds (or updates) a sentinel-marker block in the project's `CLAUDE.md`:

```
# smriti:principles
@~/.claude/skills/smriti/lib/resolvers/principles.md
```

Run it once per repo. `/bootstrap` calls it automatically for new repos; existing already-bootstrapped repos run it directly. Re-running on the same repo is a no-op. If the install path ever moves, re-running updates the `@`-line in place via the marker. The CLI fails loud rather than silently overwriting if user content has been inserted between the marker and the `@`-line.

### Soft auto-nudge

Every smriti skill checks for the sentinel marker on entry. If it's missing, the preamble prints:

```
NOTE: principles not installed in this repo. Run 'smriti principles-install' to enable cross-project coding principles.
```

That's the rollout signal — opt in when you see it. No interactive prompts; ignored skills get noticed eventually because the nudge is persistent.

### Trade-offs accepted in v1

- **Path portability.** The `@`-import uses the smriti install path (`~/.claude/skills/smriti/`). On machines where smriti lives elsewhere, the import won't resolve until the user updates the path. Acceptable trade-off in solo / intrapreneur use.
- **No cite-by-ID.** Reviews say `Tier 1b (locality)` rather than `violates p1-locality`. Structured frontmatter + a `smriti-principles` CLI is tracked as a v2 follow-up ([ELI-32](https://linear.app/itselijah/issue/ELI-32)).
- **Mid-session reload.** Adding the `@`-import in an already-running Claude Code session won't auto-load until the session restarts — the CLI prints a one-line reminder.

## Browser audit (`/design-review` v2)

`/design-review` v1 catches code-level drift (token misuse, AI-slop patterns, hierarchy mistakes) by reading the diff. v2 adds a **rendered audit** via `smriti browse` — a thin Playwright wrapper that captures screenshots at multiple viewports, the ARIA snapshot, and console errors per URL.

**Scope is deliberately narrow:**

- **Localhost only.** URLs must parse to `localhost`, `127.0.0.1`, `::1`, or `*.localhost`. `--allow-remote` is the deliberate escape hatch for public pages, off by default.
- **Audit-only.** Read-only navigation; no clicks, no form fills, no agent-drivable interactive surface. (Out of scope for v0.2; revisit when a second consumer earns it.)
- **Ephemeral context per URL.** Fresh Playwright context every audit; no persistent profile; no shared cookies/storage; downloads disabled; permissions denied. CSS animations + transitions disabled for stable screenshots.

**Auth on localhost** is handled via Playwright's `storageState` pattern:

```bash
smriti browse login http://localhost:3000 --storage ~/.smriti/projects/<slug>/auth-state.json
# Headed Chromium opens. Log in manually. Close the window.
# State saved to auth-state.json (mode 0600).
```

Subsequent audits reuse it: `smriti browse audit ... --storage <path>`. If the session expires, `smriti browse` exits with code 3 (auth_stale) and `/design-review` prompts to re-login.

**Output:** the agent gets a structured `audit.json` per URL with all page-derived strings wrapped as `{untrusted: true, kind, value}` observations. **The wrapper is provenance, not enforcement** — `/design-review` never feeds the raw audit to an LLM; trusted findings reference observation IDs from `untrusted_observations[]` instead of embedding page text.

**Exit codes:** `0` ok · `1` usage · `2` browser/runtime · `3` auth-stale · `4` URL gate violation.

**Updating:** `smriti browse update` bumps the npm package and refreshes the bundled Chromium binary in lockstep (avoids a binary/package version mismatch).

## Interactive HTML specs

Long markdown review reports get skimmed. When a review skill has **several
findings**, `smriti html` renders them as one interactive page you triage in the
browser — accept / reject / edit each finding, add free-form notes — then round-
trips your decisions back into the skill in an **iterative loop**: submit → Claude
revises → the tab live-reloads → react again, until you finish. `/plan-eng-review`
is the first consumer; `/eng-review` and `/plan-design-review` are next.

**Markdown stays the source of truth.** The HTML is a *generated view* of the
findings, written to `~/.smriti/projects/<slug>/views/` (runtime state, never
committed) — so grep-ability is preserved and nothing in-repo gains markup noise.

**Sessioned local app, not a dumb transport:**

- **Localhost only.** The server binds `127.0.0.1` on an ephemeral port; nothing
  is exposed off-machine.
- **Revision-scoped.** Each review run gets a `session_id`, each render a
  `revision_id`. A submit is accepted only when both match the latest open
  revision — an old browser tab or a second concurrent review can't cross streams
  (`stale_revision` / `unknown_session`). Decisions key off **stable finding ids**,
  so a stale submit is never misapplied to the wrong card.
- **Self-cleaning.** An idle server self-terminates and stale state is swept on
  the next `serve`, so a skill that dies mid-loop never orphans a process.
- **Never hard-stuck.** The page always offers a **copy-paste** payload block if
  the server is gone, and the skill falls back to one AskUserQuestion per finding
  if you'd rather not open a browser.

```
smriti html serve <spec.json>          # start the server, print {session_id,port,url}
smriti html await --session <id>       # block until you submit; print the decisions
smriti html render --session <id> <spec.json>   # swap content + bump revision (re-render)
smriti html stop  --session <id>       # tear down (idempotent)
```

**Exit codes:** `0` ok · `1` usage · `2` runtime · `3` invalid spec/payload · `5` await-timeout · `6` no-server.

## What's deferred (v0.2 / later)

- **`STALE` approval auto-detection** — currently manual; v0.2 hashes plan content and auto-invalidates approvals when the plan changes underneath them.
- **Cross-machine memory sync** — runtime state in `~/.smriti/` is local-only; no sync layer.

## Acknowledgments

- [**gstack**](https://github.com/garrytan/gstack) by Garry Tan — the architecture this is forked from. Most of the structural ideas (per-skill SKILL.md.tmpl, shared preamble, learnings JSONL, slug cache, approvals concept) come from there.
- [**`frontend-design`**](https://github.com/anthropics/claude-plugins-official/tree/main/plugins/frontend-design) plugin — source of several entries in our AI-slop blacklist (`lib/resolvers/design-hard-rules.md`).
- [**Anthropic Cookbooks**](https://github.com/anthropics/claude-cookbooks) — frontend aesthetics patterns.

## License

MIT. See [LICENSE](LICENSE).
