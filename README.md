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
- [What's deferred (v0.2 / later)](#whats-deferred-v02--later)
- [Acknowledgments](#acknowledgments)
- [License](#license)

## The pipeline

Each skill produces an artifact the next one reads. Run them in order; downstream skills know what came before.

```
   THINK              PLAN                       BUILD              REVIEW                   SHIP
   ─────              ─────                      ─────              ─────                    ────
                  ┌─ /plan-eng-review     ─┐                  ┌─ /eng-review     ─┐
/bootstrap → /office-hours →                   →  (you write) →                       → /ship
                  └─ /plan-design-review  ─┘                  └─ /design-review  ─┘

  /design-consultation                                                          /learn  (anytime)
```

| Stage | Skill | Writes |
|-------|-------|--------|
| Think | `/bootstrap` | `PROJECT.md` (one-time per repo) |
| Think | `/design-consultation` | `DESIGN.md` + self-contained HTML preview |
| Think | `/office-hours` | `~/.smriti/projects/<slug>/<branch>-design-<ts>.md` |
| Plan | `/plan-eng-review` | Engineering Review Decisions section in design doc |
| Plan | `/plan-design-review` | Design Review Decisions section + 0–10 scores |
| Review | `/eng-review` | Auto-fixes + entries in `reviews.jsonl` |
| Review | `/design-review` | Atomic `style(design):` commits + audit report |
| Ship | `/ship` | Tests, version, CHANGELOG, bisectable commits, PR |
| Memory | `/learn` | `~/.smriti/projects/<slug>/learnings.jsonl` |

## Approval gates

Each review skill stamps its verdict at the top of the design doc. `/ship` reads the stamps and warns when required gates are missing.

```
## Approvals

- ✅ /office-hours       — 2026-04-26 — mode: users; rec: Option 2
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

Requires [Claude Code](https://docs.anthropic.com/en/docs/claude-code), [Bun](https://bun.sh) ≥ 1.0, [Git](https://git-scm.com), [jq](https://jqlang.github.io/jq/), and optionally [`gh`](https://cli.github.com) for `/ship`'s GitHub path.

```bash
git clone https://github.com/itsRoze/smriti.git ~/.claude/skills/smriti
cd ~/.claude/skills/smriti
./setup
```

`setup` symlinks each skill into `~/.claude/skills/<name>/` and the bin helpers into `~/.local/bin/smriti-*`. To update later: `git pull && ./setup`.

## What a session looks like

```
You:    /bootstrap

Claude: SLUG: itsroze-myapp     BRANCH: main     IS_FIRST_TIME: yes
        Pre-filling from package.json + README + git log...

        [single bundled AskUserQuestion: project type / target user /
         lean / tech stack / deploy target / design priority]

        Wrote PROJECT.md. Logged 1 architecture learning.
        Recommend /design-consultation next (design priority = high).

You:    /office-hours

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

[...design doc written; approval stamped; handoff to /plan-eng-review]
```

## Architecture

```
~/.claude/skills/smriti/                   ← code (this repo)
├── bin/                                     # smriti-{slug,config,learnings-*,codex-probe,update-check,approvals}
├── lib/resolvers/                           # {{PLACEHOLDER}} content (preamble, rubric, hard-rules, etc.)
├── scripts/                                 # gen-skill-docs.ts, skill-check.ts
├── eng-review/checklist.md                  # the artifact /eng-review reads
└── <skill>/SKILL.md.tmpl                    # one per skill (generated SKILL.md is gitignored)

~/.local/bin/smriti-*                      ← CLI helpers (symlinks)

~/.smriti/                                 ← runtime state (never versioned)
├── config                                   # global k=v: lean, codex_default, …
├── slug-cache/<sha>                         # path → slug mapping (absence = "first-time" trigger)
└── projects/<slug>/
    ├── learnings.jsonl                        # append-only, decay-aware
    ├── reviews.jsonl                          # one entry per review run
    ├── <branch>-approvals.json                # per-branch approval state
    ├── <branch>-design-<ts>.md                # design docs (one per /office-hours run)
    └── design-audit-<ts>.md                   # /design-review reports

<your-repo>/
├── PROJECT.md                              # /bootstrap output (committed)
├── DESIGN.md                               # /design-consultation output (committed)
└── TODOS.md                                # cross-referenced by every review skill
```

## Configuration

`smriti-config get|set|unset|list` writes to `~/.smriti/config`.

| Key | Values | Default | Effect |
|-----|--------|---------|--------|
| `lean` | `senior` / `prototype` | `senior` | review depth — `senior` insists on failure-mode coverage; `prototype` ships rough |
| `codex_default` | `on` / `ask` / `off` | `ask` | whether `/office-hours` and `/plan-eng-review` auto-prompt for a Codex second opinion |
| `proactive` | `true` / `false` | `true` | reserved (proactive skill suggestions) |
| `explain_level` | `default` / `terse` | `default` | reserved (output verbosity) |

## What's deferred (v0.2 / later)

- **Live browser audits in `/design-review`** — v1 is static (code-level only). v2 adds screenshots, console-error capture, and responsive checks via a browser daemon.
- **`smriti-project` CLI** — `list` / `current` / `forget` / `archive` helpers for managing tracked projects ([ELI-19](https://linear.app/itselijah/issue/ELI-19)).
- **`STALE` approval auto-detection** — currently manual; v0.2 hashes plan content and auto-invalidates approvals when the plan changes underneath them.
- **Cross-machine memory sync** — runtime state in `~/.smriti/` is local-only; no sync layer.

## Acknowledgments

- [**gstack**](https://github.com/garrytan/gstack) by Garry Tan — the architecture this is forked from. Most of the structural ideas (per-skill SKILL.md.tmpl, shared preamble, learnings JSONL, slug cache, approvals concept) come from there.
- [**`frontend-design`**](https://github.com/anthropics/claude-plugins-official/tree/main/plugins/frontend-design) plugin — source of several entries in our AI-slop blacklist (`lib/resolvers/design-hard-rules.md`).
- [**Anthropic Cookbooks**](https://github.com/anthropics/claude-cookbooks) — frontend aesthetics patterns.

## License

MIT. See [LICENSE](LICENSE).
