# Changelog

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
