# Changelog

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
