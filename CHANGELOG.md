# Changelog

## 0.6.1 — 2026-05-18

- docs: add smriti-changelog-insert to README bin enumeration
- fix(ship): smriti-changelog-insert helper to bypass BSD awk multi-line -v (ELI-43)


## 0.6.0 — 2026-05-14

- refactor(brainstorm): rename /office-hours → /brainstorm
- feat(debug): add /debug skill for systematic root-cause investigation
- chore: apply /eng-review fixes from Codex second opinion
- fix(codex-second-opinion): drop obsolete --model-reasoning-effort flag

## 0.5.0 — 2026-05-07

### Added
- `eng-review/checklist.md` Pass 2 — new "CLI binary symlink coverage" item flags new or modified `bin/` scripts that derive their install location from `$0` / `$BASH_SOURCE` / `dirname` but lack a symlink-invocation test. Production invocations through `~/.local/bin/` are symlinks; absolute-path tests miss path-resolution bugs (the ELI-36 class). ([ELI-37](https://linear.app/itselijah/issue/ELI-37))
- `ship/SKILL.md.tmpl` Step 5b — smoke-test new CLIs via the PATH symlink before opening the PR. Sits between Step 5 (tests) and Step 6 (coverage audit); detects changed `bin/smriti-*` scripts and exercises each through the production install path, sandboxing destructive CLIs via `mktemp -d`. Calls out explicitly that `--help` alone is insufficient — early-exit help short-circuits before path resolution, exactly the gap that let ELI-36 ship.

### Changed
- `ship/SKILL.md.tmpl` intro — pre-existing "12 steps" undercount corrected to "13 steps (plus sub-step 5b)" to match the actual numbered steps.

### Why

ELI-36 shipped with green tests because the suite invoked the binary by absolute repo path while production invokes via `~/.local/bin/` symlink — `$0` differs between the two. Filing a permanent checklist item + smoke step is the durable fix for that bug class; "remember to test it manually" is not.

## 0.4.1 — 2026-05-07

### Fixed
- `bin/smriti-principles-install` resolved its install path from `$0` directly, but `$0` is the symlink path when invoked via PATH (`~/.local/bin/smriti-principles-install` → repo's `bin/`). `pwd -P` resolves the *directory's* symlinks, never the script's own — so `smriti_root` derived from the symlink's parent (`~/.local`) instead of the actual repo. Result: every project that ran `smriti-principles-install` got an `@`-line pointing at `~/.local/lib/resolvers/principles.md` (a non-existent path), Claude Code silently failed to load the principles, and the preamble's `HAS_PRINCIPLES=yes` check passed (it only verified marker + adjacent `@`-line *shape*, not that the referenced file existed) — so no nudge fired either. ([ELI-36](https://linear.app/itselijah/issue/ELI-36))
- Fix: dereference `$0` via the existing `resolve_symlink_one_level` helper before deriving `bin_dir`. One-hop resolution is sufficient for the documented install shape (PATH symlink → repo file). Multi-hop is acknowledged as out of scope in the helper's comment.
- **Migration:** users with existing installs re-run `smriti-principles-install` once per affected repo. The CLI's marker-update path detects the smriti-shaped `@`-line at the wrong path and replaces it. Idempotent; preserves user content.

### Added
- `scripts/test/principles.bats` Story 14 — regression test that invokes the CLI via a symlink in a sibling dir and asserts the resulting `@`-line matches the canonical line from a direct invocation. Closes the test-coverage gap that let the bug ship.

### Process
- `.gitignore` adds `/CLAUDE.md` (anchored to repo root) so smriti's own dev clone — where the CLI resolves the `@`-line to a machine-specific path like `~/dev/smriti/lib/resolvers/principles.md` — doesn't accidentally commit a non-portable CLAUDE.md. Anchored pattern prevents accidentally ignoring fixture or sub-dir CLAUDE.md files.
- Filed [ELI-37](https://linear.app/itselijah/issue/ELI-37): adds a Pass-2 checklist item to `eng-review/checklist.md` ("CLI binary symlink coverage") and a `/ship` smoke step that invokes new `bin/*` scripts via PATH symlink before opening the PR. Permanent guardrail for the class of bug ELI-36 represents.

## 0.4.0 — 2026-05-07

### Added
- `lib/resolvers/principles.md` — single-source-of-truth coding-principles file shared across every project that opts in. Tier 1 (hard gates) operationalizes "optimize for AI" as four behaviors: searchability, locality, explicitness, consistency. Tier 2 captures user preferences (small functions, descriptive names, comments-for-WHY, facade-only-on-second-consumer, etc.). Tier 2b operationalizes "leave the garden better" as a review-effort budget. Tier 3 is a narrative tie-breaker. Smell appendix names rigidity / fragility / immobility / opacity for cite-ability — diagnoses, not rules. Conflict ladder: lower-numbered tier wins. ([ELI-33](https://linear.app/itselijah/issue/ELI-33))
- `bin/smriti-principles-install` — idempotent CLI that adds (or updates) a sentinel-marker block in the project's `CLAUDE.md`:
  ```
  # smriti:principles
  @~/.claude/skills/smriti/lib/resolvers/principles.md
  ```
  Repo-root resolution via `git rev-parse --show-toplevel` (pwd fallback for non-git). Atomic temp-write + `mv` (portable across BSD/GNU). Strips CR for line comparison; normalizes CRLF to LF on rewrite. Five behaviors: create-if-missing / append-if-marker-absent / no-op-if-already-installed / migrate-on-path-change / **fail-loud** if marker present but the line below is unrelated user content (zero silent overwrites). One-level symlink resolution so the underlying target file is mutated, not the symlink replaced. Prints reload notice so the user knows to restart Claude Code to pick up the new `@`-import.
- `{{PRINCIPLES}}` resolver injected into `eng-review/SKILL.md.tmpl` (new Phase 1b + Pass 3) and `plan-eng-review/SKILL.md.tmpl` (new "Principles" section). Reviews now cite findings by tier and rule (`Tier 1b (locality)`, `Tier 2.7 (premature facade)`).
- `bootstrap/SKILL.md.tmpl` — Phase 3d calls `smriti-principles-install` after `PROJECT.md` write so new repos get the @-import automatically. Documents fail-loud behavior so /bootstrap doesn't paper over a non-zero exit.
- `lib/resolvers/preamble.md` — `HAS_PRINCIPLES` check verifies BOTH the marker line AND the adjacent `@`-line (matches the install contract; broken-install states correctly trigger the nudge instead of being suppressed). Soft auto-nudge fires early in skill output: *"NOTE: principles not installed in this repo. Run 'smriti-principles-install' to enable cross-project coding principles."*
- `scripts/test/principles.bats` — 14-scenario suite: self-contained lint (rejects relative paths AND `{{...}}` placeholders), CLI idempotency, fresh-create, preserve-existing user content, marker-update on path migration, fail-loud on adjacency violation, fail-loud when marker is the last line, subdirectory cwd resolution, empty CLAUDE.md, CRLF input detection, symlinked CLAUDE.md (mutates target, preserves symlink), byte-exact `@`-line assertion via reference install, non-git pwd fallback. Total test count: 64 bats + 4 bun.

### Changed
- `README.md` — new "Principles" section documents the file's role, install command, soft-nudge rollout, and v1 trade-offs accepted (path portability, no cite-by-ID, mid-session reload). TOC + architecture diagram + bin/ list updated.

### Cross-project propagation

Editing `lib/resolvers/principles.md` in this repo propagates to every project that has run `smriti-principles-install` — the @-import points at the smriti install path, so the next Claude Code session in any installed repo picks up the new content. No per-project sync.

### Follow-up

- v2 (structured + `smriti-principles` CLI with cite-by-ID and schema validation) tracked as [ELI-32](https://linear.app/itselijah/issue/ELI-32).

## 0.3.0 — 2026-05-02

### Added
- `bin/smriti-browse` — localhost-only browser audit CLI for `/design-review` v2. Subcommands: `audit` (multi-URL screenshots + ARIA snapshot + console capture), `login` (headed Chromium → save Playwright `storageState`), `install` (download Chromium on demand), `update` (bump npm package + refresh binary in lockstep). Strict URL gate (parsed-URL host allowlist: `localhost` / `127.0.0.1` / `::1` / `*.localhost`); `--allow-remote` is the deliberate escape hatch.
- `/design-review` v2 — gated on `browse_enabled=true`. Reads `~/.smriti/projects/<slug>/audit-urls.txt` (or first-run prompt — file lives in smriti state, never in the project repo). Runs `smriti-browse audit`, ingests `audit.json`, emits rendered findings alongside the static pass. Multi-URL approval collapse: any `page-error` / `console-error` / stale-auth → `NEEDS_CHANGES`.
- `browse_enabled` config key — `smriti-config set browse_enabled true|false`. Asked once at `./setup`; persisted; respected on subsequent runs. `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` is set when disabled, so non-UI users pay zero install-time cost.
- Audit-time isolation invariants: ephemeral `BrowserContext` per URL, no persistent profile, no shared cookies/storage, downloads disabled, permissions denied, animations + transitions disabled via `addInitScript`. `auth-state.json` written with file mode `0600`.
- Untrusted-data discipline: all page-derived strings (`page-title`, `console-*`, `page-error`, `final-url`, `nav-error`, `aria-error`, `screenshot-error`) wrapped as `{id, kind, value}` in `untrusted_observations[]`. The wrapper is provenance/labeling — `/design-review` never JSON.stringifies the audit and feeds it to an LLM; trusted findings reference observations by `id`.
- Stale-auth heuristic: page navigated to a `/(sign[-_ ]?in|log[-_ ]?in|auth)/i` path from a non-login starting URL → exit `3`, no lying screenshots captured.
- Test infrastructure: `scripts/run-tests.sh` unifies bats (CLI contract + URL-gate regression — 18 new tests) and `bun test` (live Playwright integration: ARIA capture, dev-server-missing, stale-auth detection, multi-URL worst-of exit code). Tests skip cleanly when Chromium isn't installed.

### Changed
- `setup` interactively prompts on first run for browser-audit support; persists to `~/.smriti/config`. Tolerates EOF (Ctrl-D) under `set -e`.
- `bin/smriti-config` known-keys list extended with `browse_enabled`.
- `ship/SKILL.md.tmpl` Step 5 dropped the `npm test` fallback — bun is required, pnpm is the legitimate fallback. (Honors the never-npm invariant smriti has had implicitly since v0.1.)
- `package.json` — `playwright@1.59.1` is the first runtime dependency. Pinned. `smriti-browse update` bumps the npm package + reinstalls the Chromium binary in one step (avoids version drift between the two).
- `README.md` — new "Browser audit" section, updated config table + per-project state-dir layout, deferred-list line about "browser daemon" removed (shipped, no daemon).

### Removed
- `scripts/test-version-bump.sh` — superseded by `scripts/run-tests.sh` (which runs bats AND bun test).

## 0.2.0 — 2026-05-01

### Fixed
- `/ship` Step 9 now correctly detects when `VERSION` and `package.json` drift apart on a bumped branch. Previously, a single-file diff against base classified as "already bumped" and silently left the other file stale. New 4-state classifier (`FRESH` / `ALREADY_BUMPED` / `DRIFT_STALE_PKG` / `DRIFT_UNEXPECTED`) repairs the stale file without re-bumping. ([ELI-22](https://linear.app/itselijah/issue/ELI-22))
- `bin/smriti-approvals` now sanitizes branch names containing `/` (e.g., `elijah/eli-22-...`) when building state-file paths. Existing slash-named state files are migrated on first run.
- Five `SKILL.md.tmpl` files (`office-hours`, `plan-eng-review`, `plan-design-review`, `design-consultation`, `ship`) had the same latent slash-in-path bug — fixed via a new `BRANCH_SLUG` var in the shared preamble.

### Added
- `bin/smriti-version-bump` — VERSION ↔ package.json classifier and apply/repair tool. CRLF stripping, semver validation, jq-only writes.
- `bin/smriti-pr-title-rewrite` — idempotent helper that prefixes PR titles with `v<VERSION>`. Defends against glob metacharacters via literal regex matching.
- `/ship` Step 12 now passes the chosen PR title through `smriti-pr-title-rewrite`, so PR titles deterministically start with `v<VERSION> ` (idempotent on re-runs after a version bump).
- First test infrastructure: `scripts/test-version-bump.sh` runner + 32 bats tests (`scripts/test/*.bats`) covering all classifier states, hardening edge cases, and the title rewriter. Wired into `bun run test`. Requires [bats-core](https://github.com/bats-core/bats-core).
