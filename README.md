# smriti

> Sanskrit स्मृति — *memory, that which is remembered.*

A personal Claude Code skill stack. Inspired by [gstack](https://github.com/garrytan/gstack), slimmed down for solo use, designed to learn across sessions and get smarter on each codebase over time.

## Skills

| Skill | Role |
|-------|------|
| `/bootstrap` | One-time per-repo init. Captures business/user/lean context → `PROJECT.md`. |
| `/office-hours` | Feature ideation. Forcing questions, alternatives with effort estimates, completeness scores, recommendation. Auto-offers Codex second opinion. |
| `/plan-eng-review` | Lock architecture & tests. 4 ordered sections + scope challenge + auto Codex review. |
| `/plan-design-review` | 7-pass 0–10 design rating against `DESIGN.md`. Re-rate after fixes. |
| `/design-consultation` | Build design system from scratch → `DESIGN.md` + HTML preview. |
| `/eng-review` | Staff-engineer code review. Checklist-driven. AUTO-FIX vs ASK. |
| `/design-review` | Static design audit (code + `DESIGN.md` alignment). v1 = no browser. |
| `/ship` | Tests, coverage, version, CHANGELOG, PR via `gh`. Manual fallback if no GitHub remote. |
| `/learn` | Manage the learnings store: show, search, prune, export, stats, add. |

## Approval gates

Each review skill stamps the per-branch design doc with `APPROVED` / `CONDITIONAL` / `NEEDS_CHANGES` / `SKIPPED`. `/ship` reads the stamps and warns (or, with `--force`, proceeds silently) when required gates haven't passed.

```
## Approvals

- ✅ /office-hours       — 2026-04-26 — mode: users; rec: Option 2
- ✅ /plan-eng-review    — 2026-04-26 — lean: senior; 0 unresolved
- ⚠️ /plan-design-review — 2026-04-26 — avg 8.2/10; 1 deferred
- ✅ /eng-review         — 2026-04-26 — 3 findings; 2 auto-fixed
- ➖ /design-review      — 2026-04-26 — no UI files in diff
- ⏸ /ship               — not yet run
```

Required for `/ship`: `/eng-review` always; `/design-review` when UI files change. Others are recommended-not-required. State lives at `~/.smriti/projects/<slug>/<branch>-approvals.json` and is rendered into the design doc. Inspect or override directly with `smriti-approvals get` / `smriti-approvals set`.

## Install

Requires [Claude Code](https://docs.anthropic.com/en/docs/claude-code), [Bun](https://bun.sh/) v1.0+, and [Git](https://git-scm.com/).

```bash
git clone https://github.com/itsRoze/smriti.git ~/.claude/skills/smriti
cd ~/.claude/skills/smriti
./setup
```

## Architecture

- **Repo:** `~/.claude/skills/smriti/` (this directory).
- **Runtime state:** `~/.smriti/` — never versioned. Per-project learnings, design docs, review logs.
- **Per-repo artifacts:** `PROJECT.md`, `DESIGN.md`, `TODOS.md` at repo root in your projects.
- **Config:** `~/.smriti/config` (key=value, sourceable) — `lean: senior|prototype`, `codex_default: on|ask|off`.

## License

MIT. See [LICENSE](LICENSE).
