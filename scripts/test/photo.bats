#!/usr/bin/env bats
# Tests for bin/smriti-photo — pictures stored in descriptions — and for the
# sweep the three description writers run when a reference is removed.
# Run via: bun run test (which shells out to scripts/run-tests.sh)

setup() {
  ROOT="$BATS_TEST_DIRNAME/../.."
  WORK=$(mktemp -d)

  # Production-shape invocation: symlink into a fake PATH dir rather than
  # calling the in-repo path. smriti-photo resolves its own lib/ through the
  # symlink chain, and the sweep in smriti-ticket finds smriti-photo as a
  # SIBLING of itself — an absolute-path invocation would hide a break in that
  # lookup, which is exactly the wiring under test here.
  FAKE_BIN="$WORK/fake-bin"
  REPO="$WORK/repo"
  mkdir -p "$FAKE_BIN" "$REPO"
  ln -s "$ROOT/bin/smriti-photo"   "$FAKE_BIN/smriti-photo"
  ln -s "$ROOT/bin/smriti-ticket"  "$FAKE_BIN/smriti-ticket"
  ln -s "$ROOT/bin/smriti-project" "$FAKE_BIN/smriti-project"
  ln -s "$ROOT/bin/smriti-repo"    "$FAKE_BIN/smriti-repo"
  ln -s "$ROOT/bin/smriti-slug"    "$FAKE_BIN/smriti-slug"
  CLI="$FAKE_BIN/smriti-photo"
  TICKET="$FAKE_BIN/smriti-ticket"
  PROJECT="$FAKE_BIN/smriti-project"
  REPOCLI="$FAKE_BIN/smriti-repo"

  export SMRITI_HOME="$WORK/state"
  mkdir -p "$SMRITI_HOME"

  ORIG_PATH="$PATH"
  PATH="$FAKE_BIN:$PATH"

  IMG="$WORK/img"
  mkdir -p "$IMG"
  make_png "$IMG/a.png" 1
  make_png "$IMG/b.png" 2
  make_jpeg "$IMG/c.jpg"
  make_gif  "$IMG/d.gif"
  make_webp "$IMG/e.webp"
  make_svg  "$IMG/evil.svg"

  cd "$REPO"
  git init -q -b main
  git config user.email "test@smriti.local"
  git config user.name "smriti-test"
  git remote add origin "https://github.com/test/demo.git"
}

teardown() {
  PATH="$ORIG_PATH"
  cd /
  rm -rf "$WORK"
}

# Real signatures, because the whole point of the sniffer is that it reads
# these and not the filename. The trailing byte differs per $2 so two "photos"
# hash differently and exercise deduplication honestly.
make_png()  { printf '\211PNG\r\n\032\n\000\000\000\rIHDR%s' "$2" > "$1"; }
make_jpeg() { printf '\377\330\377\340\000\020JFIF\000\001\001\000\377\331' > "$1"; }
make_gif()  { printf 'GIF89a\001\000\001\000\200\000\000' > "$1"; }
make_webp() { printf 'RIFF\044\000\000\000WEBPVP8 \000\000\000\000' > "$1"; }
make_svg()  { printf '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>' > "$1"; }

# ─── add ────────────────────────────────────────────────────────────────────

@test "add: stores a png and prints the reference to put in the markdown" {
  run "$CLI" add "$IMG/a.png"
  [ "$status" -eq 0 ]
  [ "$output" = "smriti://photo/1" ]
}

@test "add: reads stdin when no file is named — the board's path" {
  run bash -c "'$CLI' add < '$IMG/a.png'"
  [ "$status" -eq 0 ]
  [ "$output" = "smriti://photo/1" ]
}

@test "add: the same image twice is stored once" {
  "$CLI" add "$IMG/a.png" >/dev/null
  run "$CLI" add "$IMG/a.png"
  [ "$status" -eq 0 ]
  [ "$output" = "smriti://photo/1" ]
  run "$CLI" list --json
  [ "$(printf '%s' "$output" | grep -o '"id"' | wc -l | tr -d ' ')" = "1" ]
}

@test "add: a different image is a different photo" {
  "$CLI" add "$IMG/a.png" >/dev/null
  run "$CLI" add "$IMG/b.png"
  [ "$output" = "smriti://photo/2" ]
}

@test "add: jpeg, gif and webp are all stored" {
  run "$CLI" add "$IMG/c.jpg" --json
  [ "$status" -eq 0 ]
  [[ "$output" == *'"mime":"image/jpeg"'* ]]
  run "$CLI" add "$IMG/d.gif" --json
  [[ "$output" == *'"mime":"image/gif"'* ]]
  run "$CLI" add "$IMG/e.webp" --json
  [[ "$output" == *'"mime":"image/webp"'* ]]
}

@test "add: an svg is refused — it is a program, not a picture" {
  run "$CLI" add "$IMG/evil.svg"
  [ "$status" -eq 5 ]
  [[ "$output" == *"not a photo smriti stores"* ]]
}

@test "add: an svg wearing a .png name is refused on its contents" {
  cp "$IMG/evil.svg" "$IMG/lie.png"
  run "$CLI" add "$IMG/lie.png"
  [ "$status" -eq 5 ]
}

@test "add: a file over the ceiling is refused, and nothing is stored" {
  SMRITI_PHOTO_MAX_BYTES=4 run "$CLI" add "$IMG/a.png"
  [ "$status" -eq 5 ]
  [[ "$output" == *"the limit is 4"* ]]
  run "$CLI" list
  [ "$output" = "no photos stored" ]
}

@test "add: an empty file is refused rather than stored as a photo of nothing" {
  : > "$IMG/empty.png"
  run "$CLI" add "$IMG/empty.png"
  [ "$status" -eq 5 ]
}

# ─── show / data / list ─────────────────────────────────────────────────────

@test "show: reports the type read from the bytes, and the reference" {
  "$CLI" add "$IMG/a.png" >/dev/null
  run "$CLI" show 1
  [ "$status" -eq 0 ]
  [[ "$output" == *"image/png"* ]]
  [[ "$output" == *"smriti://photo/1"* ]]
}

@test "show: a photo that does not exist is exit 4, not a crash" {
  run "$CLI" show 99
  [ "$status" -eq 4 ]
}

@test "data: mime on the first line, the bytes as hex on the second" {
  "$CLI" add "$IMG/a.png" >/dev/null
  run "$CLI" data 1
  [ "$status" -eq 0 ]
  [ "$(printf '%s\n' "$output" | head -1)" = "image/png" ]
  # 89504E47 is the PNG signature — the bytes came back intact.
  [[ "$(printf '%s\n' "$output" | tail -1)" == 89504E47* ]]
}

@test "data: round-trips the exact bytes that went in" {
  "$CLI" add "$IMG/a.png" >/dev/null
  "$CLI" data 1 | tail -1 | tr -d '\n' > "$WORK/hex"
  # xxd -r -p turns the hex back into bytes; compare against the original.
  xxd -r -p < "$WORK/hex" > "$WORK/out.png"
  run cmp "$IMG/a.png" "$WORK/out.png"
  [ "$status" -eq 0 ]
}

@test "list: says what is stored, and says so plainly when nothing is" {
  run "$CLI" list
  [ "$output" = "no photos stored" ]
  "$CLI" add "$IMG/a.png" >/dev/null
  run "$CLI" list
  [[ "$output" == *"#1"* ]]
  [[ "$output" == *"png"* ]]
}

# ─── rm and the id that must never come back ────────────────────────────────

@test "rm: deletes the photo" {
  "$CLI" add "$IMG/a.png" >/dev/null
  run "$CLI" rm 1
  [ "$status" -eq 0 ]
  run "$CLI" show 1
  [ "$status" -eq 4 ]
}

@test "rm: an id is never handed out twice" {
  "$CLI" add "$IMG/a.png" >/dev/null
  "$CLI" rm 1 >/dev/null
  run "$CLI" add "$IMG/b.png"
  # Without AUTOINCREMENT this comes back as photo/1, and every description
  # still referring to #1 would show the NEW picture out of the browser cache.
  [ "$output" = "smriti://photo/2" ]
}

# ─── prune ──────────────────────────────────────────────────────────────────

@test "prune: an unreferenced photo goes; a referenced one stays" {
  "$CLI" add "$IMG/a.png" >/dev/null   # 1 — will be referenced
  "$CLI" add "$IMG/b.png" >/dev/null   # 2 — will not
  "$TICKET" add "with a picture" --body 'see ![](smriti://photo/1)' >/dev/null
  run "$CLI" prune
  [ "$status" -eq 0 ]
  [[ "$output" == *"deleted 1 photo(s): 2"* ]]
  run "$CLI" show 1
  [ "$status" -eq 0 ]
}

@test "prune --dry-run: says what it would do and does nothing" {
  "$CLI" add "$IMG/a.png" >/dev/null
  run "$CLI" prune --dry-run
  [[ "$output" == *"would delete 1"* ]]
  run "$CLI" show 1
  [ "$status" -eq 0 ]
}

@test "prune: a photo referenced from an app description is spared" {
  "$CLI" add "$IMG/a.png" >/dev/null
  "$REPOCLI" edit test-demo --description 'the app ![](smriti://photo/1)' >/dev/null
  run "$CLI" prune
  [[ "$output" == *"nothing to prune"* ]]
}

@test "prune: a photo referenced from a stored document is spared" {
  "$CLI" add "$IMG/a.png" >/dev/null
  "$TICKET" add "has a plan" >/dev/null
  # Under $SMRITI_HOME/projects/<slug>/, because `ticket doc` only takes a copy
  # of the content for a path there — registered elsewhere it stores the row and
  # says out loud that the body was not kept, and this test would then be proving
  # nothing about documents at all.
  local docdir="$SMRITI_HOME/projects/test-demo"
  mkdir -p "$docdir"
  printf 'a plan\n\n![](smriti://photo/1)\n' > "$docdir/main-plan-2026-01-01T00-00-00Z.md"
  "$TICKET" doc 1 --type plan --path "$docdir/main-plan-2026-01-01T00-00-00Z.md" >/dev/null
  # The premise, asserted rather than assumed: the body really is in the store.
  run "$TICKET" doc-show 1 --json
  [[ "$output" == *"smriti://photo/1"* ]]

  run "$CLI" prune
  [[ "$output" == *"nothing to prune"* ]]
}

@test "prune --ids: only considers what it was given" {
  "$CLI" add "$IMG/a.png" >/dev/null   # 1
  "$CLI" add "$IMG/b.png" >/dev/null   # 2
  run "$CLI" prune --ids 2
  [[ "$output" == *"deleted 1 photo(s): 2"* ]]
  run "$CLI" show 1
  [ "$status" -eq 0 ]
}

@test "prune --ids: a malformed list is refused rather than silently ignored" {
  run "$CLI" prune --ids "1;DROP"
  [ "$status" -eq 2 ]
}

@test "prune: reference id 1 is not matched by a reference to id 12" {
  "$CLI" add "$IMG/a.png" >/dev/null   # 1
  "$TICKET" add "points at twelve" --body 'x ![](smriti://photo/12)' >/dev/null
  run "$CLI" prune
  # #1 is genuinely unreferenced — a substring match on "1" inside "12" would
  # have spared it and left the store growing forever.
  [[ "$output" == *"deleted 1 photo(s): 1"* ]]
}

# ─── the sweep on save ──────────────────────────────────────────────────────

@test "ticket edit: removing the line deletes the photo" {
  "$CLI" add "$IMG/a.png" >/dev/null
  "$TICKET" add "bug" --body 'here ![](smriti://photo/1)' >/dev/null
  "$TICKET" edit 1 --body 'here, described in words instead' >/dev/null
  run "$CLI" show 1
  [ "$status" -eq 4 ]
}

@test "ticket edit: a photo another description still shows is spared" {
  "$CLI" add "$IMG/a.png" >/dev/null
  "$TICKET" add "one" --body 'a ![](smriti://photo/1)' >/dev/null
  "$TICKET" add "two" --body 'b ![](smriti://photo/1)' >/dev/null
  "$TICKET" edit 1 --body 'a, without the picture' >/dev/null
  run "$CLI" show 1
  [ "$status" -eq 0 ]
}

@test "ticket edit: keeping the line keeps the photo" {
  "$CLI" add "$IMG/a.png" >/dev/null
  "$TICKET" add "bug" --body 'here ![](smriti://photo/1)' >/dev/null
  "$TICKET" edit 1 --body 'still here ![](smriti://photo/1)' >/dev/null
  run "$CLI" show 1
  [ "$status" -eq 0 ]
}

@test "ticket edit: clearing the body entirely deletes its photo" {
  "$CLI" add "$IMG/a.png" >/dev/null
  "$TICKET" add "bug" --body 'here ![](smriti://photo/1)' >/dev/null
  "$TICKET" edit 1 --body "" >/dev/null
  run "$CLI" show 1
  [ "$status" -eq 4 ]
}

@test "ticket edit: an edit that does not touch the body leaves photos alone" {
  "$CLI" add "$IMG/a.png" >/dev/null
  "$TICKET" add "bug" --body 'here ![](smriti://photo/1)' >/dev/null
  "$TICKET" edit 1 --priority 3 >/dev/null
  run "$CLI" show 1
  [ "$status" -eq 0 ]
}

@test "repo edit: removing the line from an app description deletes the photo" {
  "$CLI" add "$IMG/a.png" >/dev/null
  "$REPOCLI" edit test-demo --description 'app ![](smriti://photo/1)' >/dev/null
  "$REPOCLI" edit test-demo --description 'app, no picture' >/dev/null
  run "$CLI" show 1
  [ "$status" -eq 4 ]
}

@test "project edit: removing the line from a project description deletes the photo" {
  "$CLI" add "$IMG/a.png" >/dev/null
  "$PROJECT" add "a body of work" >/dev/null
  "$PROJECT" edit a-body-of-work --description 'p ![](smriti://photo/1)' >/dev/null
  "$PROJECT" edit a-body-of-work --description 'p, no picture' >/dev/null
  run "$CLI" show 1
  [ "$status" -eq 4 ]
}

@test "the sweep never fails the save it follows" {
  # No photo #9 has ever existed. The write must still land, and say so.
  "$TICKET" add "bug" --body 'ghost ![](smriti://photo/9)' >/dev/null
  run "$TICKET" edit 1 --body 'ghost gone'
  [ "$status" -eq 0 ]
  [[ "$output" == *"#1 updated"* ]]
}
