# Contributing to smriti

Thanks for your interest. smriti is an opinionated, personal Claude Code skill
stack — it's shared in the hope it's useful, and contributions that fit that
spirit are welcome. This guide covers how to get set up, the one rule that trips
everyone up (generated files), and how changes get shipped.

## Prerequisites

- [Claude Code](https://docs.anthropic.com/en/docs/claude-code)
- [Bun](https://bun.sh) ≥ 1.0 — build scripts, codegen, tests
- [Git](https://git-scm.com) and [jq](https://jqlang.github.io/jq/)
- [bats-core](https://github.com/bats-core/bats-core) to run the test suite (`brew install bats-core`)
- Optional: [`gh`](https://cli.github.com) for the GitHub path when shipping

## Setup

```bash
git clone https://github.com/itsRoze/smriti.git ~/.claude/skills/smriti
cd ~/.claude/skills/smriti
./setup
```

`setup` generates the skill docs, symlinks each skill into `~/.claude/skills/<name>/`,
and installs the `smriti` umbrella dispatcher into `~/.local/bin/smriti`. All CLI
helpers are reached via `smriti <command>`.

## Project layout

| Path | What lives there |
|------|------------------|
| `<skill>/SKILL.md.tmpl` | **Source of truth** for each skill (e.g. `brainstorm/`, `plan/`, `ship/`) |
| `<skill>/SKILL.md` | **Generated** from the `.tmpl` — gitignored, never hand-edited |
| `bin/` | Bash CLI helpers, dispatched via `smriti <name>` |
| `lib/resolvers/` | Shared markdown fragments spliced into skills at build time (preamble, principles, etc.) |
| `scripts/` | Build/codegen (`gen-skill-docs.ts`, `skill-check.ts`) and the `scripts/test/` bats suite |

## The one rule: `SKILL.md` is generated

Every `SKILL.md` is built from its `SKILL.md.tmpl` by the template engine, which
splices in shared fragments from `lib/resolvers/` (the `{{PLACEHOLDER}}` tokens).
The generated `SKILL.md` files are **gitignored**.

- **Edit the `.tmpl`, never the `.md`.** A hand-edit to `SKILL.md` is overwritten
  on the next build and lost.
- **Regenerate after editing a tmpl or resolver:**
  ```bash
  bun run gen:skill-docs
  ```
  (`./setup` also regenerates as its first step.)
- Editing a file in `lib/resolvers/` affects **every** skill that splices it —
  regenerate and re-read the diff to see the full blast radius.

## Tests

```bash
bun run test        # the full bats + bun suite
bun run skill:check # lint the skill templates
```

Tests live in `scripts/test/`. Follow the existing conventions: each bats file is
self-isolating (its own `mktemp` dir + `git init`), and CLI helpers are exercised
**through a PATH symlink**, not the in-repo absolute path — production installs run
via symlinks, and absolute-path tests miss path-resolution bugs.

## Coding principles

Code in this repo follows `lib/resolvers/principles.md` — four behaviors that
lower a model's cost-per-edit: searchability, locality, explicit over implicit,
and one obvious pattern per job. It is short on purpose; skim it before a
non-trivial change.

## How changes ship

smriti is built with its own pipeline — that *is* the dev workflow. The short
version:

1. **`/begin`** — describe the work, or paste the bug. It explores, plans, gets a
   Codex second opinion, and serves the plan for approval.
2. **You approve the plan** — the one gate that matters, in the browser.
3. It implements, runs `/code-review`, and verifies.
4. **You test, then say the word** — it ships and cleans the branch up itself.

If you're contributing without the pipeline, that's fine too — just keep commits
conventional (`feat:`, `fix:`, `chore:`, `docs:`…), add a CHANGELOG entry, and
make sure `bun run test` is green before opening a PR.

## Code of Conduct

This project ships a [Code of Conduct](CODE_OF_CONDUCT.md). By participating, you
agree to uphold it.
