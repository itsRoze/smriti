#!/usr/bin/env bash
# Unified test entrypoint for smriti.
#
# Runs:
#   0. gen-skill-docs — renders <skill>/SKILL.md, which is generated and gitignored
#   1. Bats — shell-tool tests (clean, ticket, trace, factory, browse, setup, …)
#   2. Bun test — TypeScript integration tests (board, smriti-html, browse)
#
# Live Playwright tests in browse-integration.test.ts skip themselves when
# Chromium isn't installed (with a printed warning), so a fresh smriti clone
# without `smriti-browse install` still passes this suite.

set -e

DIR="$(cd "$(dirname "$0")" && pwd -P)"
ROOT="$(cd "$DIR/.." && pwd -P)"

if ! command -v bun >/dev/null 2>&1; then
  cat >&2 <<EOF
bun not found. Install: https://bun.sh
EOF
  exit 1
fi

# ─── 0. Generate the skill docs ─────────────────────────────────────────────
# Every <skill>/SKILL.md is generated from its .tmpl and gitignored, so a fresh
# clone does not have one. A bats test greps the rendered ship/SKILL.md as a
# regression lock, and it failed on any checkout where nobody had run setup —
# which is every clone, and would be CI too. Generating here rather than
# loosening the test: the rendered file IS what ships, so it is the right thing
# to assert against.
echo "── generating skill docs ────────────────────────"
(cd "$ROOT" && bun run scripts/gen-skill-docs.ts)
echo ""

# ─── 1. Bats ────────────────────────────────────────────────────────────────
if ! command -v bats >/dev/null 2>&1; then
  cat >&2 <<EOF
bats-core not found. Install:
  brew install bats-core
or follow https://github.com/bats-core/bats-core
EOF
  exit 1
fi

echo "── bats ─────────────────────────────────────────"
bats "$DIR/test/"

# ─── 2. Bun test ────────────────────────────────────────────────────────────
echo ""
echo "── bun test ─────────────────────────────────────"
cd "$ROOT"
# Only test files matching *.test.ts; otherwise Bun would also try to "run"
# .bats files (Bash) as TS modules.
bun test scripts/test/*.test.ts
