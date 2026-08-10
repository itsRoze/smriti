# Changelog

## Unreleased

### Added
- **A ticket is a page now, at `#/t/<id>`.** It was the only thing on the board with no address — apps and projects had routes, a ticket had a centred panel that existed only while you kept it open. So you could not send someone a ticket, reopen one from history, or reload onto it, and ticket #8's run ↔ review-page join had nowhere to land. It had also outgrown the box: since the body became a reading-and-writing surface the run trace was the tallest thing on screen, and dependencies and ordering each want a block of their own. Laid out as the job card it is — a reading column for the body, paper trail and trace, beside a sticky stub holding where it is filed and every disposition, so acting no longer means scrolling back past what you just read. Below 940px the stub stacks *above* the body: burying the disposition under six hundred words would have rebuilt the panel's actual bug in one column. The number becomes the monogram in the tile the other pages give their initials, the mono line becomes the branch (carrying the PR link, because a PR is something a branch *has*), and the tally becomes time — total, agent, yours, in the two colours the trace below reuses. Status is struck across the head of the stub as a real stamp, once on arrival and never again on a live redraw.
- **Escape is a ladder.** Ticket → its project → its app → the board, one rung at a time. The back button knew a single step before this, so a filed ticket would have skipped its project; the margin likewise knew only about the two views that *are* an app or a project, and now marks where a ticket lives rather than going blank on the view you are deepest inside.
- **The phase bars mean something.** Each is drawn against the longest phase in its run, with the unused remainder of the track as the scale — so a gate that sat on you for 24 minutes reads as a quarter of the three-hour build that followed it. They used to fill their own track and split by ratio, which carried no magnitude at all and is why they had to be capped at 180px: a chart that looked like it meant something and did not.
- **"Waiting on you" clicks through to the live plan.** A run parked at Gate 2 records the `smriti html` session its review is served on (`runs.html_session`, schema v3), and the board resolves it to a URL on every read — never storing the port, which dies with the server. Liveness is *proved* rather than assumed: the pid is alive, the port answers, and the server answering reports that session's own id. Anything less and a recycled pid or a reused port eventually points you at someone else's page. The link appears on the waiting row and in the ticket detail, and simply does not appear when there is nothing live to open.
- **Mockups render at Gate 2 instead of arriving as source code.** Cards gain `mockup_html` — a complete self-contained HTML document, shown in an iframe sandboxed with `allow-scripts` and deliberately **without** `allow-same-origin`. `/begin` has told the agent to put a mockup in front of you at Gate 2 since the review page existed, and there was nowhere to put one: `body_md` is escape-first, so a live card was found displaying 21,534 characters of HTML as text. Frames report their own height through an injected shim, honoured only from that frame's `contentWindow` (a sandboxed frame's origin is the string `null`, so origin is not a check worth making) and clamped so a tall mockup scrolls inside itself rather than pushing the Approve bar off the page.
- **`smriti html url --session <id>`** — where a session is, if it is genuinely up; exit 6 if not, the same code `await` already uses for "no server". Read-only: it reports what it finds and deletes nothing, because the board calls it on every state read.
- **`/begin` bootstraps a repo on its first run** instead of refusing and naming another command. No `PROJECT.md` means it pre-fills from the manifest, README and git history, asks one bundled question, writes `PROJECT.md`, runs `smriti principles-install`, and carries straight on into the actual request.
- **`/begin` investigates root cause when the request is a bug.** A symptom, a stack trace or an issue reference routes through reproduce → trace backward → gapless causal chain before anything gets planned, and writes a `<branch>-debug-<ts>.md` artifact with a fixed shape (problem, reproduction, root cause, fix, tests, confidence, follow-ups). A plan written over an unknown cause is a guess.
- **`/begin` ships and cleans up itself** once you say the word. Gate 3 is unchanged — it still stops and waits for you — but saying so no longer hands off to a separate skill. Cleaning runs only when the branch actually merged.
- **`ship_target` config key** (`pr` | `main`, default `pr`). A destination, not a policy: `pr` pushes and opens or updates a PR, leaving the ticket at `in_review`; `main` merges into the base branch and cleans up, marking it `shipped`. The existing ticket state machine is untouched, and nothing auto-merges.
- **Run durations, phase timing, and your-time vs agent-time.** The trace already recorded when everything happened; nothing did the subtraction. `smriti trace` now computes it — `list --json` carries `duration_s`/`agent_s`/`you_s`, `show` gains a per-phase breakdown, and a new `smriti trace stats` reports median duration per skill and per phase so a regression in how long `/begin` takes is visible rather than merely felt. All of it in SQL, so the board and `smriti factory` read the same numbers instead of computing their own.
- **The distinction that makes a slow run diagnosable: time at a gate is *yours*, not the agent's.** A run decomposes into segments between recorded instants; a segment opened by an `awaiting` event is time a human spent deciding, and it is attributed to the gate's phase rather than to whatever ran next. `duration_s` is defined as `agent_s + you_s`, so the split always accounts for the whole run — including when a clock jumps backwards. If a gate reliably costs twenty idle minutes a run, that is now a number you can read, and it is a finding about the workflow rather than about the agent.
- **The board shows time.** Live elapsed on anything running, relative time on everything else, how long a gate has been sitting on you, and a per-run phase breakdown in the ticket detail — a stacked bar plus the numbers, pine ink for agent time and highlighter for yours. `p` opens **pace**: medians per skill and per phase across the last 30 days. A blocked herdr session deliberately gets no duration — herdr reports status without a timestamp and keeps no history.
- **A margin for apps and projects.** The three levels existed in the data and had working pages, but reaching one meant navigating away, so the structure was invisible unless you went looking. The board now carries a persistent index down the left — drawn as the ruled *margin* of the page rather than as another box, and the one unrotated thing on it. Apps, their projects, and the loose band under each; app-less ideas last with their ghost sigil. `b` collapses it to a column of sigils and back, and the choice sticks. Below ~1200px it starts collapsed, in CSS, so a resize keeps working. The list is built from the work, never from the repositories table — that holds a row for every repo you have ever stood in, most with no tickets and a machine-generated slug.
- **Finished work is reachable.** "shipped 3 · cancelled 1" was a dead count; it is now the fold that reveals them, on the board and on both pages. Hidden by default, `h` toggles every fold at once, and the preference sticks — the reveal itself deliberately does not, so unfolding one app's history today does not leave it unfolded tomorrow. One toggle rather than a six-status filter set: shipped and cancelled mean one thing, and an idea is un-started rather than completed. The board still keeps a day's residue of what you shipped, because a card that evaporates the moment you mark it done is harsh feedback on the one surface that spans every app.
- **A key lives on the control it operates.** The hint bar had reached twelve items and wrapped on a laptop, so it now carries a key only when nothing on screen can wear it. `b` is drawn on the margin's own tab and `h` at the end of the fold line it belongs to, as keycaps rather than bare letters — written down rather than revealed on hover, because the board replaces its html about once a second and a node swapped under a still cursor never regains `:hover`. `?` remains the full list.

### Changed
- **Session state moved to `~/.smriti/html-sessions/<id>`.** It used to live under the project's views dir, so finding a session needed its id *and* a repo slug — and the two slugs in play are derived independently. A `sess-` id is globally unique; it is the only key it ever needed. Rendered HTML files stay under the project, where you browse them.
- **The schema migration chain guards each step on the shape it changes and stamps the version once, at the end.** v3 adds its column with `ALTER TABLE ADD COLUMN`, not the v2 rebuild: other `/begin` sessions write runs and events to the same `factory.db` concurrently, and a table rebuild under live writers can lose rows or orphan events. Stamping inside a step was its own bug — a v2-shaped store took the v2 path, found nothing to rebuild, stamped itself current and never gained the column.

### Fixed
- **The approve gate was a one-way state, so "waiting on you" was wrong in both directions.** Entering Gate 2 was an instruction in the skill with *nothing* specified for leaving it, so runs sat in `awaiting` for the rest of their lives — a false "waiting on you" over work that was quietly implementing — while a revision re-served after "request changes" reopened a real gate with no event at all. It also corrupted the your-time/agent-time split: one run was found with 15 minutes of agent work booked as human idle time. Fixed in the transport rather than the prose, because an instruction can be forgotten and this one was: `serve` and `render` open the gate, `await` and `stop` close it. `--if-html-session` scopes a close to the gate it opened, so `await` and `stop` are safely redundant and a stale `stop` cannot close a gate a newer `serve` has since opened. The **idle reaper closes the gate too** — a loop nobody comes back to is precisely the case no `stop` ever runs for, and by the time one did the statedir was already gone. All of it best-effort: bookkeeping never breaks the review loop it describes.
- **Retiring a skill did not actually retire it.** The generated `SKILL.md` is gitignored, so deleting a skill's `SKILL.md.tmpl` left the file — and therefore the directory — behind after a pull. `setup` registered any directory containing a `SKILL.md`, and its stale-symlink sweep skipped anything whose directory still existed, so a retired skill silently came back on the next install with its old body intact. Generation now sweeps a `SKILL.md` whose template is gone (removing the directory when nothing else remains), and the sweep in `setup` keys on "does the target still have a `SKILL.md`" rather than "does the directory exist". Retirement is what closed this, but the bug predates it: any renamed skill would have left its old body installed and model-invocable.
- **`/begin`'s verify step was documented with an invocation that could not run.** It showed `smriti browse audit <url>` with no `--out`, which `bin/smriti-browse` hard-requires — the command exited 1 before launching a browser, so web verification silently never produced evidence. Nothing had ever created the `~/.smriti/projects/<slug>/audits/` directory that the README describes and `smriti clean` purges; it was only ever deleted. The documented invocation now passes `--out` pointed at that path.

### Removed
- **The opinion layer.** `/ship`, `/clean`, `/debug` and `/bootstrap` are no longer skills. They are steps inside `/begin`, which leaves two skills: the flow and the taste (`/design-consultation`). The ceremony existed so a human could inspect the middle of the pipeline — separate commands to invoke, separate approvals to give, separate summaries to read. That is no longer how this gets used, and every one of those seams cost a decision on every run. Skill registration is filesystem-driven, so `./setup` drops the four stale symlinks on the next run — see the matching entry under Fixed for what that required.
- **The principles tier ladder, and 129 of the file's 179 lines.** What remains is the four behaviors that actually lower a model's cost-per-edit — searchability, locality, explicit over implicit, one obvious pattern per job — as flat headings with one comply/violate pair each. Deleted: the conflict ladder and its "review must block on a Tier 1 violation" enforcement language, Tier 2's style tutoring (explanatory variables, small functions, comment rules), the Tier 2b cleanup-scope table, Tier 3 tie-breakers, the smell appendix, and both "how review/implementation uses this file" sections. Current models do that natively; ranking it was drag. The `CLAUDE.md` `@`-import contract is byte-identical, so `smriti principles-install` and every repo that already ran it are unaffected — they just load a shorter file.
- **Behavior deliberately dropped with the skills**, all of it human-inspection affordance: `/clean`'s interactive batch approval (`smriti clean --all` still does it from the CLI), `/debug`'s escalation table and mode-drift tripwires, the debug artifact's tier-citation slot, `/ship`'s reopen-vs-new-PR question, and `/bootstrap`'s `--force` re-bootstrap gate.

## 1.3.0 — 2026-08-08

Projects become real. A "project" in smriti was a string — the slug derived from your git remote — with no entity behind it. That conflated two different things: the **app** you are working on, and the **body of work** you are doing inside it. This release separates them, and makes both edges of the relationship optional.

### Added
- **Apps, projects and tickets are three levels, not one.** An app is a codebase. A project is a named body of work inside one app ("search v2", "the run trace"), and never spans two. A ticket belongs to a project, **or** to an app directly (a one-off bug), **or** to neither — an idea.
- **`smriti ticket add` works anywhere.** It used to refuse outside a git repo, which made a stray thought impossible to capture at the moment you had it. Ideas with no app land in their own band at the bottom of the board.
- **`smriti project`** — the new entity: `add`, `list`, `show`, `edit`, `done`, `rm`. Deleting a project keeps its tickets and leaves them loose in the app; a grouping going away is not a reason to destroy what it grouped.
- **App pages and project pages on the board.** Clicking an app heading opens `#/r/<slug>`: description, `PROJECT.md` and `DESIGN.md` rendered from the repo, its projects, its loose tickets, its paper trail. A project opens `#/p/<id>` — the same shape without the document tabs, since `DESIGN.md` describes the codebase rather than one body of work in it. Both are real URLs, so reload, deep-link and browser-back all work.
- **Re-filing.** `smriti ticket edit --project P` / `--no-project` / `--repo S`, and a project picker on the board. A move carries the ticket's documents and run history with it, because each row holds its own copy of where it belongs.
- **`smriti repo show` / `edit`** — an app's name and description, and the JSON the board's page reads.

### Changed
- **`smriti project` is now `smriti repo`.** Every verb it had — `new`, `list`, `current`, `forget`, `rename` — has always operated on a repository. The old name was freed for the entity that lives inside one.
- **`smriti repo rename` no longer orphans your work.** It moved the state directory and the slug-cache and left every ticket, document and run behind under a slug that no longer existed. It now moves all of them in one transaction and reports what it moved.
- **`smriti repo forget` keeps tickets and projects**, and says so — work history is not app state.
- **`ticket current` emits `TICKET_PROJECT`** alongside the id, title and status.

### Fixed
- **`smriti repo show` exited 1, silently, for any app without a `PROJECT.md`.** `repo_path_for_slug` ended on a bare `[ -n "$fallback" ] && printf ...`, so "no path known" returned 1 — and under `set -e` the caller's assignment aborted the command with no output. "No path" is an answer, not a failure.
- **Multi-column reads dropped a leading empty field.** They joined columns with a tab and split with `IFS=$'\t' read`, but tab is IFS *whitespace*: bash collapses runs of it and strips a leading one, so a ticket with no app shifted every field left and `ticket start` read the ticket's title as its app slug. A non-printable separator does not fix it either — the sqlite3 CLI renders `char(31)` as the printable bytes `^_` on output. Reads are now one statement per field, one line per value.

### Fixed (found by review, before release)
- **`smriti repo list --json` was broken on a machine with no `factory.db`** — the empty-store branch passed its SQL as sqlite3's *database filename*, so sqlite3 opened the statement as a file, printed a parse error, read the caller's stdin as SQL, and left a file in the working directory named after the query. `repo show --json` returned nothing, which made the board's repo-doc route 404 forever.
- **`ticket edit <id> --project ""` silently detached the ticket from its app.** An empty value read as "no project" and, through the project's own app lookup, as "no app" — the ticket vanished from its app's board section, `repo show`, and `ticket list`. Both `--project` and `--repo` now reject an empty value; `--no-project` is how you detach.
- **The board could file a captured ticket under the server's working directory.** `POST /api/tickets` omitted `--repo` when the body had none, so `smriti-ticket` derived one from wherever `smriti` happened to be started. It now passes `-` explicitly.
- **Live updates wiped the keyboard selection.** `refresh()` drives the router, which reset selection unconditionally — and the board broadcasts about once a second while an agent runs, so pressing `j` then `s` a moment later did nothing at all. Selection is now cleared when the *view* changes and kept when the same view re-renders.
- **A live update destroyed an in-progress description edit.** Re-rendering replaced the textarea without firing its blur handler, so the typed text was lost unsaved. Re-renders are now deferred while an editor is focused, and the document pane keeps its scroll position.
- **The app and project pages shared three element ids with the ticket overlay** (`#desc`, `#descedit`, `#docview`). Because `querySelector` returns the first match and the page precedes the overlay in the DOM, editing a ticket body on an app page saved the *app's* description into the ticket, and a document opened from the overlay rendered behind it. The pages now use their own ids.
- **The app page listed done and archived projects** as though they were live, contradicting the board and the re-file picker.
- **`smriti factory --list` merged an app named `ideas` with every app-less ticket** — `ideas` is a legal slug, so the bucket key is now `(ideas)`, which slug validation makes unrepresentable.
- **The migration guard was racy and swallowed its own errors.** It ran in a separate process from the migration, so two worktrees hitting a cold store at once both proceeded and the loser died claiming the migration failed; and any read failure was treated as "already current", permanently recording a migration that never happened. It is now serialised with a lock and distinguishes "current" from "could not tell".
- **`ticket list --json` no longer reuses the `project_slug` key**, which meant the *repository* in v1.2. The project's handle is `project_ref`, so a stale reader breaks loudly instead of silently reading a different entity.

### Migration
The schema version lives in the database as `PRAGMA user_version`, not in a marker file beside it — restoring a pre-upgrade backup of `factory.db`, or syncing it between machines, would otherwise leave the marker claiming a shape the data does not have.

`factory.db` is migrated in place, once, the first time any command touches it: `project_slug` becomes a nullable `repo_slug` on `tickets`, `documents` and `runs`, and a nullable `project_id` joins it. SQLite can do neither in place, so this is a table rebuild — guarded so it cannot run twice, wrapped in one transaction so it lands whole or not at all, and it invents no projects (existing tickets become one-off tickets in their app, which is a legitimate state). This is the first migration smriti has needed; `lib/factory-schema.sql` still only ever CREATEs, and the reshaping lives in `_db_migrate_v2` in `lib/factory-db.sh`.

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
