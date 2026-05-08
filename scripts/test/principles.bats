#!/usr/bin/env bats
# Tests for the principles feature:
#   1. Self-contained lint on lib/resolvers/principles.md.
#   2-10. bin/smriti-principles-install behavior across CLAUDE.md states.
#
# Run via: bun run test (which shells out to scripts/run-tests.sh)

setup() {
  ROOT="$BATS_TEST_DIRNAME/../.."
  CLI="$ROOT/bin/smriti-principles-install"
  PRINCIPLES_FILE="$ROOT/lib/resolvers/principles.md"
  WORK=$(mktemp -d)
  cd "$WORK"
  git init -q
}

teardown() {
  cd /
  rm -rf "$WORK"
}

# ─── Story 1: self-contained lint ──────────────────────────────────────────

@test "principles.md is self-contained: no relative-path imports or includes" {
  # Reject @-imports starting with a dot (relative paths) like @./foo or @../foo
  run grep -nE '^@\.' "$PRINCIPLES_FILE"
  [ "$status" -ne 0 ] || { echo "found relative @-import:"; echo "$output"; false; }

  # Reject markdown links/refs to relative paths like (./...) or (../...)
  run grep -nE '\(\.\.?/' "$PRINCIPLES_FILE"
  [ "$status" -ne 0 ] || { echo "found relative path reference:"; echo "$output"; false; }
}

@test "principles.md is self-contained: no unresolved template placeholders" {
  # Reject {{UPPERCASE}} placeholders — file must be standalone, no resolver pass.
  run grep -nE '\{\{[A-Z_]+\}\}' "$PRINCIPLES_FILE"
  [ "$status" -ne 0 ] || { echo "found template placeholder:"; echo "$output"; false; }
}

# ─── Story 2: idempotent re-run ────────────────────────────────────────────

@test "install is idempotent: second run is a no-op" {
  run "$CLI"
  [ "$status" -eq 0 ]
  [[ "$output" == *"created"* ]]

  HASH_AFTER_FIRST=$(shasum CLAUDE.md | awk '{print $1}')

  run "$CLI"
  [ "$status" -eq 0 ]
  [[ "$output" == *"already installed"* ]]

  HASH_AFTER_SECOND=$(shasum CLAUDE.md | awk '{print $1}')
  [ "$HASH_AFTER_FIRST" = "$HASH_AFTER_SECOND" ]
}

# ─── Story 3: fresh-create on missing CLAUDE.md ────────────────────────────

@test "fresh-create: CLAUDE.md absent → CLI creates it with marker block" {
  [ ! -f CLAUDE.md ]
  run "$CLI"
  [ "$status" -eq 0 ]
  [ -f CLAUDE.md ]
  grep -q '^# smriti:principles$' CLAUDE.md
  grep -q '^@.*principles\.md$' CLAUDE.md
}

# ─── Story 4: preserve existing content ────────────────────────────────────

@test "preserve-existing: existing CLAUDE.md content survives append" {
  cat > CLAUDE.md <<'EOF'
# Project rules

Be kind to the dog.
EOF
  ORIGINAL_LINES=$(wc -l < CLAUDE.md)

  run "$CLI"
  [ "$status" -eq 0 ]
  [[ "$output" == *"added @-import"* ]]

  # Original content still present
  grep -q '^# Project rules$' CLAUDE.md
  grep -q '^Be kind to the dog\.$' CLAUDE.md

  # Marker block appended
  grep -q '^# smriti:principles$' CLAUDE.md

  # File grew, didn't shrink
  NEW_LINES=$(wc -l < CLAUDE.md)
  [ "$NEW_LINES" -gt "$ORIGINAL_LINES" ]
}

# ─── Story 5: marker-update on path migration ──────────────────────────────

@test "marker-update: smriti-shape @-line at stale path → CLI replaces it" {
  cat > CLAUDE.md <<'EOF'
# smriti:principles
@~/old/smriti/lib/resolvers/principles.md
EOF
  run "$CLI"
  [ "$status" -eq 0 ]
  [[ "$output" == *"updated @-import path"* ]]

  # Old path gone; new path present.
  ! grep -q '@~/old/smriti' CLAUDE.md
  grep -q '^@.*principles\.md$' CLAUDE.md
  # Marker preserved.
  grep -q '^# smriti:principles$' CLAUDE.md
}

# ─── Story 6: fail-loud on adjacency violation ─────────────────────────────

@test "fail-loud: marker present + unrelated next line → exit non-zero, file unchanged" {
  cat > CLAUDE.md <<'EOF'
# smriti:principles
random user content here
keep this line
EOF
  CHECKSUM_BEFORE=$(shasum CLAUDE.md | awk '{print $1}')

  run "$CLI"
  [ "$status" -ne 0 ]
  [[ "$output" == *"ERROR"* ]] || [[ "${stderr:-$output}" == *"ERROR"* ]]

  CHECKSUM_AFTER=$(shasum CLAUDE.md | awk '{print $1}')
  [ "$CHECKSUM_BEFORE" = "$CHECKSUM_AFTER" ]
}

# ─── Story 7: subdirectory cwd ─────────────────────────────────────────────

@test "subdirectory cwd: CLI resolves repo root via git rev-parse" {
  mkdir -p sub/dir/deep
  cd sub/dir/deep

  run "$CLI"
  [ "$status" -eq 0 ]

  # Marker landed at repo root, not in the subdirectory.
  [ -f "$WORK/CLAUDE.md" ]
  [ ! -f CLAUDE.md ]
  grep -q '^# smriti:principles$' "$WORK/CLAUDE.md"
}

# ─── Story 8: empty CLAUDE.md ──────────────────────────────────────────────

@test "empty CLAUDE.md: zero-byte file → marker block written, no spurious blank line" {
  : > CLAUDE.md
  [ ! -s CLAUDE.md ]

  run "$CLI"
  [ "$status" -eq 0 ]
  grep -q '^# smriti:principles$' CLAUDE.md

  # First non-empty line should be the marker (no leading blanks).
  FIRST_LINE=$(awk 'NF{print; exit}' CLAUDE.md)
  [ "$FIRST_LINE" = "# smriti:principles" ]
}

# ─── Story 9: CRLF input ───────────────────────────────────────────────────

@test "CRLF input: marker detected on Windows-line-ending file → idempotent re-run" {
  # Establish canonical install in a sibling dir so the test doesn't replicate
  # the CLI's path-resolution logic — single source of truth lives in the CLI.
  mkdir reference
  ( cd reference && git init -q && "$CLI" >/dev/null )
  CANONICAL=$(cat reference/CLAUDE.md)

  # Same content, CRLF line endings.
  printf '%s' "$CANONICAL" | awk 'BEGIN{ORS="\r\n"} {print}' > CLAUDE.md

  run "$CLI"
  [ "$status" -eq 0 ]
  [[ "$output" == *"already installed"* ]]
}

# ─── Story 10: symlinked CLAUDE.md ─────────────────────────────────────────

@test "symlinked CLAUDE.md: CLI mutates the target file, symlink preserved" {
  mkdir other
  echo "# original content" > other/real.md
  ln -sf "$WORK/other/real.md" CLAUDE.md

  run "$CLI"
  [ "$status" -eq 0 ]

  # Symlink still a symlink (didn't get replaced by a regular file).
  [ -L CLAUDE.md ]

  # Underlying target file got the marker block.
  grep -q '^# smriti:principles$' other/real.md
  grep -q '^# original content$' other/real.md
}

# ─── Story 11: byte-exact expected @-line ──────────────────────────────────

@test "fresh-create writes the canonical expected @-line byte-for-byte" {
  # Reference install in a sibling dir captures the canonical line straight
  # from the CLI — no replication of resolve_principles_import_path logic.
  mkdir reference
  ( cd reference && git init -q && "$CLI" >/dev/null )
  EXPECTED_AT_LINE=$(grep '^@' reference/CLAUDE.md)

  # Same install in the test repo. Lines must match exactly, not just by pattern.
  "$CLI" >/dev/null
  ACTUAL_AT_LINE=$(grep '^@' CLAUDE.md)
  [ "$ACTUAL_AT_LINE" = "$EXPECTED_AT_LINE" ]

  # Also assert the line contains the ~/-prefixed form when smriti is under $HOME
  # (the canonical case for any standard install).
  case "$EXPECTED_AT_LINE" in
    @~/*) ;;  # ok — shape we expect under $HOME
    *) skip "smriti install is not under \$HOME; skipping ~/-prefix assertion" ;;
  esac
}

# ─── Story 12: marker is last line (no line below) → fail-loud ────────────

@test "fail-loud: marker is last line in CLAUDE.md → exit non-zero, file unchanged" {
  printf '# smriti:principles\n' > CLAUDE.md
  CHECKSUM_BEFORE=$(shasum CLAUDE.md | awk '{print $1}')

  run "$CLI"
  [ "$status" -ne 0 ]
  [[ "$output" == *"no line below"* ]] || [[ "${stderr:-$output}" == *"no line below"* ]]

  CHECKSUM_AFTER=$(shasum CLAUDE.md | awk '{print $1}')
  [ "$CHECKSUM_BEFORE" = "$CHECKSUM_AFTER" ]
}

# ─── Story 13: non-git directory pwd fallback ─────────────────────────────

@test "non-git dir: CLI uses pwd fallback when not in a git repo" {
  NONGIT=$(mktemp -d)
  cd "$NONGIT"
  ! git rev-parse --show-toplevel >/dev/null 2>&1

  run "$CLI"
  [ "$status" -eq 0 ]
  [ -f "$NONGIT/CLAUDE.md" ]
  grep -q '^# smriti:principles$' "$NONGIT/CLAUDE.md"

  cd /
  rm -rf "$NONGIT"
}

# ─── Story 14: PATH-launched invocation via symlink ───────────────────────

# Regression test for the bug where invoking the CLI through a symlink
# (e.g., ~/.local/bin/smriti-principles-install → repo's bin/) caused $0 to
# be the symlink path and the smriti_root resolution to derive from the
# symlink's parent dir rather than the actual repo. The @-line in CLAUDE.md
# would point to a non-existent path.

@test "symlink-launched CLI: @-line resolves to the real repo's principles.md" {
  # Create a symlink to the CLI in a separate dir, mimicking ~/.local/bin/
  mkdir -p fake-bin-dir
  ln -sf "$CLI" fake-bin-dir/smriti-principles-install

  # Invoke via the symlink, not the real CLI path.
  run fake-bin-dir/smriti-principles-install
  [ "$status" -eq 0 ]

  # The @-line must point to the REAL repo's lib/resolvers/principles.md, not
  # to a path derived from fake-bin-dir's parent (which would be the test WORK).
  ACTUAL_AT=$(grep '^@' CLAUDE.md)

  # Compare against the canonical line from a direct CLI invocation.
  mkdir reference
  ( cd reference && git init -q && "$CLI" >/dev/null )
  EXPECTED_AT=$(grep '^@' reference/CLAUDE.md)

  [ "$ACTUAL_AT" = "$EXPECTED_AT" ]
}
