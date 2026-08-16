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
#
# ONE FILE PER INVOCATION, not one `bun test` over the whole glob. Bun runs test
# FILES concurrently, and most of these stand up a real board server — sampling a
# five-file run found three alive at once, each with its own sqlite store, and
# two of the files drive a real Chromium on top. The browser tests then starve
# and blow their 30s budget, and WHICH ones blow it changes every run: one pass
# failed 20 tests, the next 6, the next 2. That reads as a regression in
# whichever describe lost the race, which is the worst possible way for a suite
# to lie — every one of those files is green on its own, every time.
#
# Wall-clock is not the cost it looks like, because the parallel version was
# thrashing: the concurrent run took 288s and the serial one is comparable, with
# the difference being time these processes spent waiting on each other.
status=0
for f in scripts/test/*.test.ts; do
  bun test "$f" || status=1
done
exit "$status"
