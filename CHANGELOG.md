# Changelog

## 1.2.0 — 2026-08-08

The work layer. smriti had no concept of *work*: the flow started at a free-text `/begin` prompt, with no backlog, no ticket, and no view across projects. Ideas lived in a separate tracker, disconnected from the system that does the work.

### Added
- **`smriti` on its own opens the board** — a locally served page showing every project, every ticket, what is running, and what is waiting on you, drawn as a planning sketchbook (grid paper, pine-marker ink, hand-drawn boxes, highlighter for what needs a decision). Keyboard-first throughout; starting a ticket cuts its worktree and opens a Claude Code session via herdr or tmux, then shows the exact attach command. Every route of the local server is authenticated (bootstrap-secret → HttpOnly cookie, Host and Origin checks); piped or redirected, bare `smriti` stays the plain dispatcher. An earlier iteration of this entry described a raw-mode TUI — it was built, then replaced by the board in the same release; `smriti factory --list` survives as the scriptable read.
- **`smriti ticket`** — the work layer, stored in `~/.smriti/factory.db`. Add, list, show, start, status, done, plus a document index. `--json` on the read verbs, so the board is a client of the same contract you use by hand.
- **`smriti trace`** — runs and phase events, so a run is watchable while it happens and reviewable afterwards. `events.id` is the cursor: one query serves both a live tail and full history.
- **Documents are indexed against their ticket.** Plans, debug docs and audits register where they live as they're written; the markdown on disk stays the source of truth and the filename contract is untouched.
- **Worktree per ticket.** `smriti ticket start` cuts one, so several tickets can be in flight without colliding.
- **`smriti ticket edit|cancel|rm`** — a ticket's description is editable (inline on the board, `⌘⏎` to save); `cancel` parks work reversibly and keeps its paper trail; `rm` deletes the ticket and its index rows but never the markdown on disk.
- **Light and dark.** The board ships both grounds — marker on paper, chalk on slate — following the OS by default, with `t` to override.
- **A project-scoped `/code-review`.** Claude Code's built-in is compiled in as manual-invocation-only, so `/begin`'s review step could never reach it and silently did nothing. The replacement is model-invocable and reads `principles.md`, so findings cite the tier they violate.

### Changed
- **The skills stamp the ticket.** `/begin`, `/debug`, `/ship` and `/clean` pick it up from the branch via the preamble's `$TICKET`. `/ship` moves it to in review and records the PR; `/clean` marks it shipped once the merge is confirmed. A ticket is never required — every skill works unchanged on a hand-cut branch.
- **Linear is no longer the system of record.** `/debug` still reads a Linear issue when you paste one, but the local store is what smriti tracks against.

### Fixed
- **`/clean` no longer breaks on worktrees.** It ran `git checkout <default>` in three places, which fails inside a linked worktree when the default branch is checked out elsewhere — and under `set -e` that crashed rather than refused. Branch-lifecycle commands now run against the primary worktree, a branch held by a linked worktree gets that worktree removed first, and running `/clean` from inside the worktree it is deleting works.
- **A new worktree no longer looks like a new project.** `IS_FIRST_TIME` was keyed on the path hash, so every freshly-cut worktree fired the `/bootstrap` nudge. It is now keyed on repo identity.
- **`/ship` no longer builds an empty PR title.** It called `smriti pr-title-rewrite "" "$RAW_TITLE"`; the empty version argument is a usage error, so the title came back empty every time. The call is removed — `/ship` hasn't version-prefixed titles since 1.0.
- **Stale zsh completions** for `approvals` and `version-bump`, both removed in 1.0, are gone.
- `VERSION` and `package.json` had drifted apart (1.1.1 vs 1.0.0); both are now 1.2.0.

## 1.1.1 — 2026-07-18

### Changed
- **The interactive HTML review loop is mandatory for multi-finding reviews.** Gate 2 of `/begin` and the shared html-render resolver no longer present AskUserQuestion as a discretionary alternative: a plan or N-finding review always goes through `smriti html serve` + `await`. Fallbacks are strictly failure handling — an `await` timeout means re-await; a server that dies after the page rendered means use the page's "Copy response" block; only `serve` failing to start (no page ever renders) permits the one-question-per-finding fallback.

## 1.1.0 — 2026-07-18

### Changed
- **Codex review is now autonomous.** The `ask` mode (an AskUserQuestion before every Codex pass) is gone. The new default, `codex_default=auto`, has Claude decide per change: run the Codex second opinion unless the change is genuinely small *and* straightforward (docs/copy, config flips, renames, ~≤30 mechanical lines with no logic surface), and note the skip in one line instead of asking. `on` and `off` behave as before; a legacy `ask` value in config is treated as `auto`.

## 1.0.0 — 2026-07-09

A ground-up simplification. smriti was a multi-stage pipeline of a dozen skills coordinated by an approvals state machine; it's now a single command.

### Changed
- **`/begin` is the whole flow.** One straight line — explore (parallel agents) → plan → Codex review → approve (interactive HTML) → implement → `/code-review` → verify (Playwright screenshots) → finish — stopping for you at exactly three gates: a genuine question, plan approval, and final review. Shipping stays in your hands: `/ship` opens a PR or pushes to main only when you say so.
- **`/ship` is now light.** Tests, sync base, commit, and open a PR (or push to main) — no version bumps, no CHANGELOG generation, no inline review.
- **`/clean` now garbage-collects.** When it deletes a merged branch, it also purges that branch's out-of-repo scratch (plan/design/debug docs + browser audits), so runtime state no longer accumulates forever.

### Removed
- The `/brainstorm`, `/plan`, and `/work` skills — folded into `/begin`.
- The `/eng-review` and `/design-review` skills — replaced by the native `/code-review` skill and the `frontend-design` skill for UI.
- The `/plan-eng-review` and `/plan-design-review` skills — Codex now reviews the plan instead.
- The `/learn` skill and the per-project learnings store.
- The approvals state machine and per-branch approvals file, and the `smriti approvals`, `smriti learnings-log`, `smriti learnings-search`, `smriti version-bump`, and `smriti changelog-insert` helpers.

### Kept
- `/bootstrap`, `/design-consultation`, `/debug`, `/clean`, the shared coding principles, the interactive HTML plan view, and the `smriti browse` Playwright audit.

## 0.16.1 — 2026-06-30

### Added
- Project logo and a README hero with status badges.
- `CONTRIBUTING.md` and `CODE_OF_CONDUCT.md` for open-source readiness.

### Changed
- Scrubbed internal issue-tracker references from docs, comments, and tests; the institutional lessons they anchored are kept inline.
- `.gitignore` now excludes machine-local Claude Code settings (`.claude/settings.local.json`).

## 0.16.0 — 2026-06-26

### Added
- `/begin` now orchestrates the whole pipeline for feature work — design → plan → review → build → review — pausing only at two human gates (plan approval and the pre-ship ping). Downstream skills stay unchanged; the orchestration is a layer on top.

## 0.15.0 — 2026-06-26

### Changed
- Review skills now triage findings by stakes: low-stakes calls are auto-resolved with a one-line note, and only genuine forks become questions. Each run ends with a digest of what was decided for you, so you review in one pass instead of step by step.

## 0.14.0 — 2026-06-25

### Added
- Interactive HTML review for plans and reviews — findings open in the browser as cards you accept, reject, or edit, instead of a long back-and-forth in the terminal. Falls back to the terminal when no browser is available.

## 0.13.0 — 2026-06-03

### Added
- `/plan` — turns a design doc into a unit-by-unit implementation plan that the build step executes against.
- `/work` — executes the plan: builds each unit, tests as it goes, and commits incrementally.

### Fixed
- Per-branch design/plan/debug doc lookup, which had silently broken when the filename shape drifted from the lookup glob.

## 0.12.0 — 2026-06-02

### Added
- `/eng-review` fans out parallel per-principle reviewers on larger diffs, then merges and de-dupes the findings. The cutoff is configurable via the `persona_threshold` config key.
- New review-checklist category flags judgment-encoding numbers (thresholds, limits, defaults) that ship with no cited basis.

## 0.11.0 — 2026-05-24

### Added
- `/begin` — a triage entry point that classifies your request and routes it to the right skill.

## 0.10.1 — 2026-05-22

### Added
- `/brainstorm` reads prior `/debug` investigations on the branch as context.

## 0.10.0 — 2026-05-20

### Added
- `smriti project rename <old> <new>` for renaming a tracked project.
- `smriti project list` now shows each project's source repo path.

### Changed
- The slug cache records the source repo path, and a path-only slug prints a migration notice once a remote is available.

## 0.9.1 — 2026-05-20

### Fixed
- `/ship` now fails loudly on a malformed approvals state file or a broken slug lookup, instead of proceeding silently.

## 0.9.0 — 2026-05-20

### Changed
- A single `smriti` umbrella command replaces the per-helper PATH symlinks — all CLI helpers are now reached via `smriti <command>`.

## 0.8.0 — 2026-05-19

### Added
- `/clean` — post-merge tidy: checkout the default branch, pull, delete the merged feature branch, and prune stale remote refs. Shows the candidate branches and asks once before any deletion, and refuses safely on a dirty tree, unmerged work, or a detached HEAD.

## 0.7.1 — 2026-05-19

### Fixed
- `setup` discovers skills from the filesystem instead of a hardcoded list, so newly added or renamed skills are always installed. It also removes stale smriti-managed symlinks while leaving foreign symlinks untouched.

## 0.7.0 — 2026-05-18

### Added
- `smriti project` — manage the set of tracked projects: `list`, `current`, and `forget <slug>` (with a confirmation before deleting project state).

### Security
- `smriti project forget` rejects slugs containing `/` or starting with `.` before deleting, closing a path-traversal hole.

## 0.6.1 — 2026-05-18

### Fixed
- CHANGELOG insertion on macOS — multi-commit entry lists no longer drop the new section under BSD awk.

## 0.6.0 — 2026-05-14

### Added
- `/debug` — systematic root-cause investigation skill.

### Changed
- Renamed `/office-hours` → `/brainstorm`.

## 0.5.0 — 2026-05-07

### Added
- `/ship` smoke-tests new or changed `bin/` CLIs through their installed PATH symlink before opening a PR, catching path-resolution bugs that pass the test suite but break the installed command.
- Review checklist flags `bin/` scripts that derive their install path from `$0`/`$BASH_SOURCE`/`dirname` but lack a symlink-invocation test.

## 0.4.1 — 2026-05-07

### Fixed
- `smriti-principles-install` resolved the wrong install path when run via its PATH symlink, so the coding principles silently failed to load. Re-run `smriti-principles-install` once per affected repo to repair the import.

## 0.4.0 — 2026-05-07

### Added
- Shared coding-principles file (`lib/resolvers/principles.md`) with tiered rules, plus `smriti-principles-install` to import it into a project's `CLAUDE.md`. `/eng-review` and `/plan-eng-review` now cite findings by principle tier and rule, and `/bootstrap` installs the import automatically for new repos.

## 0.3.0 — 2026-05-02

### Added
- `/design-review` v2 — an optional localhost browser audit (screenshots, ARIA snapshot, console capture) via the new `smriti browse` CLI, gated on a `browse_enabled` config key and restricted to localhost URLs by default.

### Changed
- `setup` asks once whether to enable browser-audit support; non-UI users pay no browser-download cost.

## 0.2.0 — 2026-05-01

### Added
- `smriti version-bump` and `smriti pr-title-rewrite` helpers, wired into `/ship`.
- First test suite (bats + bun), run via `bun run test`.

### Fixed
- `/ship` detects when `VERSION` and `package.json` drift apart and repairs the stale file without re-bumping.
- Branch names containing `/` are sanitized when building approvals state-file paths.
