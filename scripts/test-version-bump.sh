#!/usr/bin/env bash
# Test runner for bin/smriti-version-bump and bin/smriti-pr-title-rewrite.
# Wraps bats-core. Install with: brew install bats-core

set -e

if ! command -v bats >/dev/null 2>&1; then
  cat >&2 <<EOF
bats-core not found. Install:
  brew install bats-core
or follow https://github.com/bats-core/bats-core
EOF
  exit 1
fi

DIR="$(cd "$(dirname "$0")" && pwd -P)"
exec bats "$DIR/test/"
