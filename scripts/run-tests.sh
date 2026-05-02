#!/usr/bin/env bash
# Unified test entrypoint for smriti.
#
# Runs:
#   1. Bats — shell-tool tests (version-bump, pr-title-rewrite, browse argv/gate/schema)
#   2. Bun test — TypeScript integration tests (browse-integration: live Playwright)
#
# Live Playwright tests in browse-integration.test.ts skip themselves when
# Chromium isn't installed (with a printed warning), so a fresh smriti clone
# without `smriti-browse install` still passes this suite.

set -e

DIR="$(cd "$(dirname "$0")" && pwd -P)"
ROOT="$(cd "$DIR/.." && pwd -P)"

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
if ! command -v bun >/dev/null 2>&1; then
  cat >&2 <<EOF
bun not found. Install: https://bun.sh
EOF
  exit 1
fi

echo ""
echo "── bun test ─────────────────────────────────────"
cd "$ROOT"
# Only test files matching *.test.ts; otherwise Bun would also try to "run"
# .bats files (Bash) as TS modules.
bun test scripts/test/*.test.ts
