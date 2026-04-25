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
| `/create-pr` | Tests, coverage, version, CHANGELOG, PR via `gh`. Manual fallback if no GitHub remote. |
| `/learn` | Manage the learnings store: show, search, prune, export, stats, add. |

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
- **Config:** `~/.smriti/config.yaml` — `lean: senior|prototype`, `codex_default: on|ask|off`.

## License

MIT. See [LICENSE](LICENSE).
