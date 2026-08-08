<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/logo-dark.svg">
  <img alt="smriti" src="assets/logo.svg" width="260">
</picture>

<p><em>स्मृति — Sanskrit for memory; that which is remembered.</em></p>

<p>
  A personal Claude Code skill stack — opinionated, one command from<br>
  idea to a reviewed, tested result, with the human in the loop at three gates.
</p>

<p>
  <a href="LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-6E7681?style=flat"></a>
  <a href="https://github.com/itsRoze/smriti/releases"><img alt="version" src="https://img.shields.io/github/package-json/v/itsRoze/smriti?style=flat&label=version&color=A37B5C"></a>
  <a href="https://docs.anthropic.com/en/docs/claude-code"><img alt="built for Claude Code" src="https://img.shields.io/badge/built%20for-Claude%20Code-D97757?style=flat"></a>
</p>

</div>

Inspired by [gstack](https://github.com/garrytan/gstack), slimmed down for solo use.

---

## Contents

- [The flow](#the-flow)
- [The factory](#the-factory)
- [The skills](#the-skills)
- [Install](#install)
- [What a run looks like](#what-a-run-looks-like)
- [Architecture](#architecture)
- [Configuration](#configuration)
- [Managing tracked projects](#managing-tracked-projects)
- [Principles](#principles)
- [Browser verification](#browser-verification)
- [Interactive HTML specs](#interactive-html-specs)
- [What changed in v1.0](#what-changed-in-v10)
- [Acknowledgments](#acknowledgments)
- [License](#license)

## The flow

One command — **`/begin`** — takes a change from idea to a reviewed, tested result in a single straight line. No pipeline, no state machine, no artifacts to hand between skills. It stops for you at exactly **three gates** (marked ★); everything else runs on its own.

```
  /begin
    │
    0  Ground        read PROJECT.md / DESIGN.md + git state
    1  Understand    parallel Explore agents map the blast radius
    2 ★ Gate 1        Clarify — ask only if there's a genuine fork
    3  Plan          write plan doc to ~/.smriti/… (out of your repo)
    4  Codex review  independent pass critiques the plan (gated)
    5 ★ Gate 2        Approve — review the plan as interactive HTML; loop till approved
    6  Implement      build the plan, test as you go, incremental commits
    7  Review         native /code-review on the diff; fix real bugs
    8  Verify         Playwright audit (web) or test suite / CLI checks
    9 ★ Gate 3        Finish — summarize, then STOP. You say the word to ship.
```

Read the steps top to bottom, that's the whole thing:

0. **Ground** — read `PROJECT.md` / `DESIGN.md` and the git state. No `PROJECT.md`? It stops and tells you to run `/bootstrap` first.
1. **Understand** — fans out parallel `Explore` subagents to map the blast radius, existing patterns, integration points, and test coverage. UI scope pulls in the `frontend-design` skill.
2. ★ **Gate 1 · Clarify** — asks a tight set of questions *only* when there's a real fork it can't resolve from the code, `PROJECT.md`, or sensible defaults. Skips otherwise.
3. **Plan** — writes a plan doc to `~/.smriti/projects/<slug>/<branch>-plan-<ts>.md`, out of your repo. A sizable UI change also builds mockups via `frontend-design` so you *see* it at Gate 2.
4. **Codex review** — an independent Codex pass critiques the plan; real gaps get folded in. Autonomous — smriti runs it by default and skips it (with a one-line note) only for genuinely small, straightforward changes. Availability-gated — skipped silently if Codex isn't installed.
5. ★ **Gate 2 · Approve** — serves the plan as an [interactive HTML view](#interactive-html-specs) (`smriti html serve`) you approve or request changes on. Loops until approved.
6. **Implement** — builds the plan, tests as it goes, makes incremental commits.
7. **Review** — runs smriti's native `/code-review` on the diff and fixes real bugs.
8. **Verify** — Playwright screenshots + ARIA + console errors via `smriti browse audit` for web work; test suite / CLI checks for non-web.
9. ★ **Gate 3 · Finish** — summarizes the change (with screenshots) and then **stops**. Shipping is explicit: you say the word and it invokes `/ship`.

## The skills

Six skills. `/begin` is the spine; the rest are the setup and teardown around it.

| Skill | What it does | Writes |
|-------|--------------|--------|
| `/begin` | The whole flow — idea to reviewed, tested result, three human gates. Manual-only. | `~/.smriti/projects/<slug>/<branch>-plan-<ts>.md` |
| `/bootstrap` | One-time repo init. Installs the coding principles into the repo's `CLAUDE.md`. | `PROJECT.md` |
| `/design-consultation` | Build a design system from scratch — the greenfield "establish the vibe" step. | `DESIGN.md` + self-contained HTML preview |
| `/debug` | Standalone root-cause investigator. | `~/.smriti/projects/<slug>/<branch>-debug-<ts>.md` |
| `/ship` | Get the branch out on your explicit word — open a PR or push straight to main. Deliberately light: no version bumps, no CHANGELOG, no inline review. | — |
| `/clean` | Post-merge tidy — checkout base, pull, delete the merged branch, prune. Also purges that branch's out-of-repo scratch (plan/design/debug docs + audits), since the work has shipped. | — |

## Install

Requires [Claude Code](https://docs.anthropic.com/en/docs/claude-code), [Bun](https://bun.sh) ≥ 1.0, [Git](https://git-scm.com), [jq](https://jqlang.github.io/jq/), and optionally [`gh`](https://cli.github.com) for `/ship`'s GitHub path. To run the test suite (`bun run test`): [bats-core](https://github.com/bats-core/bats-core) (`brew install bats-core`).

```bash
git clone https://github.com/itsRoze/smriti.git ~/.claude/skills/smriti
cd ~/.claude/skills/smriti
./setup
```

`setup` symlinks each skill into `~/.claude/skills/<name>/` and the `smriti` umbrella dispatcher into `~/.local/bin/smriti`. All CLI helpers are accessed via `smriti <command>`. To update later: `git pull && ./setup`.

## What a run looks like

```
You:    /begin  add a "copy link" button to the share sheet

Claude: Ground   — PROJECT.md + DESIGN.md loaded; branch: share-copy-link
        Understand — 4 Explore agents: share sheet lives in one component;
                     no existing clipboard util; DESIGN.md covers icon buttons.

        ★ Gate 1 · Clarify
        Only fork worth surfacing: toast on copy, or silent? [toast / silent]
You:    toast

Claude: Plan    — wrote share-copy-link-plan-…md; mockup built (UI change).
        Codex   — independent pass: flagged a missing aria-live region. Folded in.

        ★ Gate 2 · Approve
        Serving plan at http://127.0.0.1:53318 — approve or request changes.
You:    [clicks Approve in the browser]

Claude: Implement — button + clipboard util + toast; 3 commits, tests green.
        Review    — /code-review: 2 findings, both fixed.
        Verify    — smriti browse audit: screenshots + ARIA clean, no console errors.

        ★ Gate 3 · Finish
        Done. Share sheet now has a copy-link button (screenshots above).
        Say the word to ship.
You:    ship it

Claude: /ship → PR opened.
```

## Architecture

```
~/.claude/skills/smriti/                   ← code (this repo)
├── bin/                                     # smriti (umbrella dispatcher) + smriti-{factory,ticket,trace,slug,config,project,codex-probe,update-check,pr-title-rewrite,browse,clean,default-branch,principles-install,html,latest-doc}
├── lib/                                     # factory-schema.sql + factory-db.sh (the work layer's storage)
├── lib/resolvers/                           # {{PLACEHOLDER}} content (preamble, principles, design rules, etc.)
├── scripts/                                 # gen-skill-docs.ts, skill-check.ts, run-tests.sh + test/*.bats + test/*.test.ts
└── <skill>/SKILL.md.tmpl                    # one per skill (generated SKILL.md is gitignored)

~/.local/bin/smriti                        ← umbrella dispatcher (symlink → bin/smriti)

~/.smriti/                                 ← runtime state (never versioned)
├── config                                   # global k=v: lean, codex_default, …
├── factory.db                               # the work layer: tickets, document index, runs + phase events
├── slug-cache/<sha>                         # path → slug mapping (one entry per worktree; same repo → same slug)
└── projects/<slug>/                         # a branch's plan/design/debug docs + audits are
    │                                         #   purged by /clean when that branch is deleted
    ├── <branch>-plan-<ts>.md                 # implementation plans (one per /begin run)
    ├── <branch>-debug-<ts>.md                # debug summaries (one per /debug run)
    ├── views/                                # generated HTML views for Gate 2 (never committed)
    ├── auth-state.json                       # Playwright storageState for verify (mode 0600, never committed)
    └── audits/<branch>-<ts>/                 # verify — screenshots, ARIA snapshots, audit.json per URL

<your-repo>/
├── PROJECT.md                              # /bootstrap output (committed)
├── DESIGN.md                               # /design-consultation output (committed)
└── CLAUDE.md                               # @-imports lib/resolvers/principles.md from smriti install
```

## The factory

`smriti` on its own opens the board — a locally served page showing every
project, every ticket, what is running, and what is waiting on you:

```bash
smriti
```

The look is a planning sketchbook: warm grid paper, pine-marker ink,
hand-drawn boxes, a highlighter swipe on whatever needs a decision. Everything
is keyboard-first — `↑↓` move, `⏎` open, `s` start, `c` capture, `⌘K` for
anything — and every action lands in under a keystroke-and-a-half.

Starting a ticket cuts its worktree and opens a Claude Code session via
**herdr** (preferred, if installed) or **tmux**, then shows the exact attach
command — the session is a terminal; the button never needed to be. With
neither installed it hands you the command with a copy button.

The server binds 127.0.0.1 only, and every route — reads included — is
authenticated: the CLI mints a single-purpose secret, the browser exchanges it
for an `HttpOnly` cookie, and requests with a foreign `Host` or cross-site
`Origin` are refused outright. Piped or redirected, `smriti` stays the plain
dispatcher it has always been; `smriti factory --list` remains the scriptable
read.

Everything the board does is also a command, and the board is only a client of
them — it holds no SQL of its own:

```bash
smriti ticket add "users should be able to export to CSV"   # capture, anywhere
smriti ticket list                                          # this project
smriti ticket list --all                                    # every project
smriti ticket start 7                                       # worktree + branch; prints the path
smriti ticket show 7                                        # detail + its documents
```

`/begin`, `/debug`, `/ship` and `/clean` pick the ticket up from the branch, so
status tracking costs nothing: `/ship` moves it to in review and records the
PR, and `/clean` marks it shipped once the merge is confirmed. Plans, debug
docs and audits are indexed against the ticket as they're written — the files
stay on disk as the source of truth, and the ticket just knows where they are.

**A ticket is never required.** Every skill works exactly as before on a branch
you cut by hand.

### Watching a run

Runs record their phases, so what a skill did is reviewable rather than a
transcript to re-read:

```bash
smriti trace list --active     # what's running, what's parked at a gate
smriti trace show <run-uid>    # one run, phase by phase
smriti trace tail --after 0    # the cursor query — live tail and history in one
```

## Configuration

`smriti config get|set|unset|list` writes to `~/.smriti/config`.

| Key | Values | Default | Effect |
|-----|--------|---------|--------|
| `lean` | `senior` / `prototype` | `senior` | review depth — `senior` insists on failure-mode coverage; `prototype` ships rough |
| `codex_default` | `on` / `auto` / `off` | `auto` | Codex review mode — `on` always runs it, `auto` lets Claude decide per change (runs unless the change is really small or straightforward), `off` never runs it. Legacy `ask` is treated as `auto`. |
| `browse_enabled` | `true` / `false` | (asked at `./setup`) | enables `/begin`'s verify browser step via `smriti browse` (Playwright) |
| `proactive` | `true` / `false` | `true` | reserved (proactive skill suggestions) |
| `explain_level` | `default` / `terse` | `default` | reserved (output verbosity) |

## Managing tracked projects

`smriti project` owns the *set* of projects under `~/.smriti/projects/` — per-project content (plans, debug docs, designs) is managed by the skills themselves.

| Command | Purpose |
|---------|---------|
| `smriti project new <name>` | scaffold a new project directory with `git init`; print next-step guidance |
| `smriti project list` | every tracked project: slug, last-used, designs count, source path |
| `smriti project current` | slug for `$PWD` (same value the preamble exposes as `SLUG`) |
| `smriti project forget <slug> [--yes]` | delete the project dir AND every slug-cache file pointing at it — interactive confirm unless `--yes`. In-repo `PROJECT.md` / `DESIGN.md` are git-tracked and not touched. |
| `smriti project rename <old> <new>` | rename a project slug — moves state dir + updates all slug-cache entries pointing at the old slug |

`forget` deletes both the project dir and the slug-cache entry; without the second step the next `cd` into the repo resurrects the same slug.

## Principles

`lib/resolvers/principles.md` is the authoritative coding-principles file shared across every project that opts in. Tier 1 (hard gates) operationalizes "optimize for AI" as four behaviors — searchability, locality, explicitness, consistency. Tier 2 captures user preferences (small functions, descriptive names, facade only on second consumer, etc.). Tier 3 is a narrative tie-breaker. A smell appendix names common failure modes (rigidity, fragility, immobility, opacity) for cite-ability in review findings.

**Two consumers, one source of truth:**

- **Write-time:** the project's `CLAUDE.md` `@`-imports the file, so Claude Code auto-loads the principles at session start in any repo that's installed.
- **Review-time:** `/begin`'s `/code-review` step reads the same principles as explicit criteria — every finding cites a tier and rule.

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

### Trade-offs accepted

- **Path portability.** The `@`-import uses the smriti install path (`~/.claude/skills/smriti/`). On machines where smriti lives elsewhere, the import won't resolve until the user updates the path. Acceptable trade-off in solo / intrapreneur use.
- **No cite-by-ID.** Reviews say `Tier 1b (locality)` rather than `violates p1-locality`.
- **Mid-session reload.** Adding the `@`-import in an already-running Claude Code session won't auto-load until the session restarts — the CLI prints a one-line reminder.

## Browser verification

`/begin`'s **verify** step (Step 8) uses `smriti browse` — a thin Playwright wrapper that captures screenshots at multiple viewports, the ARIA snapshot, and console errors per URL, so a web change is checked as *rendered*, not just as a diff.

**Scope is deliberately narrow:**

- **Localhost only.** URLs must parse to `localhost`, `127.0.0.1`, `::1`, or `*.localhost`. `--allow-remote` is the deliberate escape hatch for public pages, off by default.
- **Audit-only.** Read-only navigation; no clicks, no form fills, no agent-drivable interactive surface.
- **Ephemeral context per URL.** Fresh Playwright context every audit; no persistent profile; no shared cookies/storage; downloads disabled; permissions denied. CSS animations + transitions disabled for stable screenshots.

**Auth on localhost** is handled via Playwright's `storageState` pattern:

```bash
smriti browse login http://localhost:3000 --storage ~/.smriti/projects/<slug>/auth-state.json
# Headed Chromium opens. Log in manually. Close the window.
# State saved to auth-state.json (mode 0600).
```

Subsequent audits reuse it: `smriti browse audit ... --storage <path>`. If the session expires, `smriti browse` exits with code 3 (auth_stale) and prompts to re-login.

**Output:** the agent gets a structured `audit.json` per URL with all page-derived strings wrapped as `{untrusted: true, kind, value}` observations. **The wrapper is provenance, not enforcement** — the raw audit is never fed to an LLM; trusted findings reference observation IDs from `untrusted_observations[]` instead of embedding page text.

**Exit codes:** `0` ok · `1` usage · `2` browser/runtime · `3` auth-stale · `4` URL gate violation.

**Updating:** `smriti browse update` bumps the npm package and refreshes the bundled Chromium binary in lockstep (avoids a binary/package version mismatch).

## Interactive HTML specs

Long markdown plans get skimmed. At **Gate 2**, `/begin` renders the plan as one
interactive page you review in the browser — approve, or request changes with
free-form notes — then round-trips your decision back into the skill in an
**iterative loop**: submit → Claude revises → the tab live-reloads → react again,
until you approve.

**Markdown stays the source of truth.** The HTML is a *generated view* of the plan,
written to `~/.smriti/projects/<slug>/views/` (runtime state, never committed) — so
grep-ability is preserved and nothing in-repo gains markup noise.

**Sessioned local app, not a dumb transport:**

- **Localhost only.** The server binds `127.0.0.1` on an ephemeral port; nothing
  is exposed off-machine.
- **Revision-scoped.** Each run gets a `session_id`, each render a `revision_id`.
  A submit is accepted only when both match the latest open revision — an old
  browser tab can't cross streams (`stale_revision` / `unknown_session`).
- **Self-cleaning.** An idle server self-terminates and stale state is swept on
  the next `serve`, so a skill that dies mid-loop never orphans a process.
- **Never hard-stuck.** The page always offers a **copy-paste** payload block if
  the server is gone, and the skill falls back to one AskUserQuestion per genuine
  fork if you'd rather not open a browser.

```
smriti html serve <spec.json>          # start the server, print {session_id,port,url}
smriti html await --session <id>       # block until you submit; print the decisions
smriti html render --session <id> <spec.json>   # swap content + bump revision (re-render)
smriti html stop  --session <id>       # tear down (idempotent)
```

**Exit codes:** `0` ok · `1` usage · `2` runtime · `3` invalid spec/payload · `5` await-timeout · `6` no-server.

## What changed in v1.0

smriti was a multi-stage pipeline — a dozen skills, each producing an artifact the next one read, with an approvals state machine gating the handoffs. v1.0 tears that down to **one linear flow**.

- **Brainstorm, plan, and build are folded into `/begin`.** No more `/brainstorm`, `/plan`, `/work` — it's all the one flow now.
- **Review is native, not a skill stack.** `/eng-review` and `/design-review` are gone; correctness review is Claude Code's own `/code-review`, and design correctness is carried by the `frontend-design` skill during planning.
- **The plan is reviewed by Codex, not by plan-review skills.** `/plan-eng-review` and `/plan-design-review` are dropped — Codex critiques the plan at Step 4.
- **No approvals state machine.** No `approvals.json`, no verdict stamps — three human gates in the flow replace the whole thing.
- **No learnings store.** `/learn` and the append-only `learnings.jsonl` are gone entirely.

## Acknowledgments

- [**gstack**](https://github.com/garrytan/gstack) by Garry Tan — the architecture this is forked from. Most of the structural ideas (per-skill SKILL.md.tmpl, shared preamble, slug cache) come from there.
- [**`frontend-design`**](https://github.com/anthropics/claude-plugins-official/tree/main/plugins/frontend-design) plugin — source of several entries in our AI-slop blacklist (`lib/resolvers/design-hard-rules.md`).
- [**Anthropic Cookbooks**](https://github.com/anthropics/claude-cookbooks) — frontend aesthetics patterns.

## License

MIT. See [LICENSE](LICENSE).
