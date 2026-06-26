#!/usr/bin/env bats
# Tests for bin/smriti-changelog-insert — CHANGELOG section prepend with multi-line entries.
# Run via: bun run test (which shells out to scripts/run-tests.sh)

setup() {
  ROOT="$BATS_TEST_DIRNAME/../.."
  WORK=$(mktemp -d)
  cd "$WORK"

  # Production-shape invocation: symlink the script into a fake PATH dir so
  # the test exercises the same install path /ship uses when the user has the
  # script on $PATH — exercising the production invocation path, not the in-repo absolute path.
  FAKE_BIN="$WORK/fake-bin"
  mkdir -p "$FAKE_BIN"
  ln -s "$ROOT/bin/smriti-changelog-insert" "$FAKE_BIN/smriti-changelog-insert"
  CLI="$FAKE_BIN/smriti-changelog-insert"
}

teardown() {
  cd /
  rm -rf "$WORK"
}

@test "fresh: emits a new CHANGELOG when none exists" {
  # Mirror /ship Step 10: write to a tmp path first, then move into place.
  # Redirecting straight to CHANGELOG.md would create an empty target before
  # the script runs, defeating the [ -f CHANGELOG.md ] branch.
  echo "- first commit" | "$CLI" "0.1.0" "2026-05-18" > out.md
  mv out.md CHANGELOG.md
  [ -s CHANGELOG.md ]
  grep -q "^# Changelog$" CHANGELOG.md
  grep -q "^## 0.1.0 — 2026-05-18$" CHANGELOG.md
  grep -q "^- first commit$" CHANGELOG.md
}

@test "insert under existing # Changelog header" {
  cat > CHANGELOG.md <<'EOF'
# Changelog

## 0.1.0 — 2026-05-01

- old entry
EOF
  echo "- new entry" | "$CLI" "0.2.0" "2026-05-18" > CHANGELOG.new
  mv CHANGELOG.new CHANGELOG.md

  # Both sections present, header preserved at top.
  head -1 CHANGELOG.md | grep -q "^# Changelog$"
  [ "$(grep -c '^## ' CHANGELOG.md)" -eq 2 ]
  grep -q "^## 0.2.0 — 2026-05-18$" CHANGELOG.md
  grep -q "^- old entry$" CHANGELOG.md
  grep -q "^- new entry$" CHANGELOG.md

  # New section appears before the old one.
  new_line=$(grep -n '^## 0.2.0' CHANGELOG.md | cut -d: -f1)
  old_line=$(grep -n '^## 0.1.0' CHANGELOG.md | cut -d: -f1)
  [ "$new_line" -lt "$old_line" ]
}

# This is the original BSD-awk bug repro: with the prior inline `-v entries=...`
# block, a multi-line ENTRIES value caused "awk: newline in string" and the new
# section silently dropped. All entries must appear in the output.
@test "multi-line entries: all bullets preserved (BSD awk bug repro)" {
  printf '%s\n' "- first" "- second" "- third" "- fourth" "- fifth" \
    | "$CLI" "0.3.0" "2026-05-18" > out.md
  mv out.md CHANGELOG.md

  grep -q "^- first$" CHANGELOG.md
  grep -q "^- second$" CHANGELOG.md
  grep -q "^- third$" CHANGELOG.md
  grep -q "^- fourth$" CHANGELOG.md
  grep -q "^- fifth$" CHANGELOG.md
}

@test "no top-level header: prepends one and preserves original content" {
  cat > CHANGELOG.md <<'EOF'
some preamble line

## 0.1.0 — 2026-05-01

- old
EOF
  echo "- new" | "$CLI" "0.2.0" "2026-05-18" > CHANGELOG.new
  mv CHANGELOG.new CHANGELOG.md

  head -1 CHANGELOG.md | grep -q "^# Changelog$"
  grep -q "^## 0.2.0 — 2026-05-18$" CHANGELOG.md
  grep -q "^some preamble line$" CHANGELOG.md
  grep -q "^- old$" CHANGELOG.md
}

@test "missing args: exits 2 with usage on stderr" {
  run "$CLI"
  [ "$status" -eq 2 ]
  [[ "$output" == *"usage:"* ]]

  run "$CLI" "0.1.0"
  [ "$status" -eq 2 ]
}
