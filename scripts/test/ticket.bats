#!/usr/bin/env bats
# Tests for bin/smriti-ticket — the work layer (tickets + the document index).
# Run via: bun run test (which shells out to scripts/run-tests.sh)

setup() {
  ROOT="$BATS_TEST_DIRNAME/../.."
  WORK=$(mktemp -d)

  # Production-shape invocation: symlink into a fake PATH dir rather than
  # calling the in-repo path. smriti-ticket resolves its own lib/ through the
  # symlink chain and shells out to the sibling smriti-slug — absolute-path
  # invocation would hide a break in either.
  FAKE_BIN="$WORK/fake-bin"
  REPO="$WORK/repo"
  mkdir -p "$FAKE_BIN" "$REPO"
  ln -s "$ROOT/bin/smriti-ticket"  "$FAKE_BIN/smriti-ticket"
  ln -s "$ROOT/bin/smriti-project" "$FAKE_BIN/smriti-project"
  ln -s "$ROOT/bin/smriti-slug"    "$FAKE_BIN/smriti-slug"
  CLI="$FAKE_BIN/smriti-ticket"
  PROJECT="$FAKE_BIN/smriti-project"

  export SMRITI_HOME="$WORK/state"
  mkdir -p "$SMRITI_HOME"

  ORIG_PATH="$PATH"
  PATH="$FAKE_BIN:$PATH"

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

# ─── add ────────────────────────────────────────────────────────────────────

@test "add: derives the project from the repo and reports the new id" {
  run "$CLI" add "Export to CSV"
  [ "$status" -eq 0 ]
  [[ "$output" == *"added: #1"* ]]
  [[ "$output" == *"test-demo"* ]]
  [[ "$output" == *"idea"* ]]
}

@test "add: --ready starts the ticket in ready instead of idea" {
  run "$CLI" add "Export to CSV" --ready
  [ "$status" -eq 0 ]
  [[ "$output" == *"ready"* ]]
}

@test "add: ids increment across tickets" {
  "$CLI" add "first"
  run "$CLI" add "second"
  [[ "$output" == *"added: #2"* ]]
}

@test "add: outside a git repo captures an idea rather than refusing" {
  # This used to be a hard error, which made a stray thought impossible to
  # capture at the moment you had it. A ticket with no app is now a real state.
  cd "$WORK"
  run "$CLI" add "orphan"
  [ "$status" -eq 0 ]
  [[ "$output" == *"no app yet"* ]]

  run "$CLI" add "orphan two" --repo other-thing
  [ "$status" -eq 0 ]
  [[ "$output" == *"other-thing"* ]]
}

@test "add: an idea has a null app, and --repo - says so explicitly" {
  cd "$WORK"
  "$CLI" add "orphan" >/dev/null
  run "$CLI" list --repo -
  [[ "$output" == *"orphan"* ]]

  # Inside a repo, --repo - still means "no app", not "derive one".
  cd "$REPO"
  "$CLI" add "deliberate idea" --repo - >/dev/null
  run "$CLI" list --repo -
  [[ "$output" == *"deliberate idea"* ]]
  run "$CLI" list
  ! [[ "$output" == *"deliberate idea"* ]]
}

@test "add: rejects an app name that could escape the store" {
  run "$CLI" add "x" --repo "../evil"
  [ "$status" -eq 2 ]
  [[ "$output" == *"invalid --repo"* ]]
}

@test "add: empty title is refused" {
  run "$CLI" add ""
  [ "$status" -eq 2 ]
  [[ "$output" == *"empty"* ]]
}

# ─── SQL safety ─────────────────────────────────────────────────────────────

@test "add: quotes, semicolons and unicode survive verbatim and drop nothing" {
  # The value doubles as an injection attempt: if it were interpolated raw the
  # tickets table would be gone by the time we read it back.
  local nasty="it's a \"test\"; DROP TABLE tickets;-- ünicode"
  run "$CLI" add "$nasty"
  [ "$status" -eq 0 ]

  run "$CLI" show 1
  [ "$status" -eq 0 ]
  [[ "$output" == *"$nasty"* ]]

  # Table still exists and still holds the row.
  run "$CLI" list
  [[ "$output" == *"DROP TABLE"* ]]
}

@test "add: a body containing newlines round-trips" {
  # .param set would corrupt this — it is a line-oriented dot-command. This is
  # the regression guard for using escaped literals instead.
  "$CLI" add "multiline" --body "line one
line two"
  run "$CLI" show 1
  [[ "$output" == *"line one"* ]]
  [[ "$output" == *"line two"* ]]
}

# ─── list ───────────────────────────────────────────────────────────────────

@test "list: empty store prints a hint, exits 0" {
  run "$CLI" list
  [ "$status" -eq 0 ]
  [[ "$output" == *"no tickets yet"* ]]
}

@test "list: hides shipped work by default, shows it under --all" {
  "$CLI" add "open one"
  "$CLI" add "closed one"
  "$CLI" done 2

  run "$CLI" list
  [[ "$output" == *"open one"* ]]
  ! [[ "$output" == *"closed one"* ]]

  run "$CLI" list --all
  [[ "$output" == *"closed one"* ]]
}

@test "list: scopes to the current repo, --all crosses apps" {
  "$CLI" add "mine"
  "$CLI" add "theirs" --repo other-app

  run "$CLI" list
  [[ "$output" == *"mine"* ]]
  ! [[ "$output" == *"theirs"* ]]

  run "$CLI" list --all
  [[ "$output" == *"theirs"* ]]
}

@test "list: --status filters, and rejects an unknown status" {
  "$CLI" add "a"
  "$CLI" add "b" --ready

  run "$CLI" list --status ready
  [[ "$output" == *"b"* ]]
  ! [[ "$output" == *" a"* ]]

  run "$CLI" list --status nonsense
  [ "$status" -eq 2 ]
  [[ "$output" == *"invalid status"* ]]
}

@test "list: --json emits parseable rows with the columns the TUI reads" {
  "$CLI" add "Export to CSV" --ready
  run "$CLI" list --json
  [ "$status" -eq 0 ]
  # No stray pragma output may precede the JSON, or jq fails here. That is the
  # regression this asserts: PRAGMA busy_timeout/journal_mode echo their values.
  echo "$output" | jq -e '.[0] | .id and .title and .status and .repo_slug'
  [ "$(echo "$output" | jq -r '.[0].title')" = "Export to CSV" ]
}

@test "list: --json on an empty store is a valid empty array" {
  run "$CLI" list --json
  [ "$status" -eq 0 ]
  [ "$(echo "$output" | jq -r 'length')" = "0" ]
}

# ─── move (the order you drag things into) ──────────────────────────────────
#
# Ticket #11. `position` is a REAL so a card dropped between two others takes
# the midpoint of its neighbours — one row written, no renumbering cascade —
# and the scope repacks to whole numbers only when a gap runs out of room.

tq() { sqlite3 "$SMRITI_HOME/factory.db" "$1"; }
# The ids of one app's tickets, in the order they would be drawn.
ord() { tq "SELECT group_concat(id) FROM (SELECT id FROM tickets WHERE repo_slug = '$1' ORDER BY position, id);"; }

four() {
  "$CLI" add one   --repo demo >/dev/null
  "$CLI" add two   --repo demo >/dev/null
  "$CLI" add three --repo demo >/dev/null
  "$CLI" add four  --repo demo >/dev/null
}

@test "move: a new ticket lands at the bottom of its group" {
  four
  [ "$(ord demo)" = "1,2,3,4" ]
}

@test "move: --after puts it directly after the target" {
  four
  "$CLI" move 1 --after 3
  [ "$(ord demo)" = "2,3,1,4" ]
}

@test "move: --before puts it directly before the target" {
  four
  "$CLI" move 4 --before 2
  [ "$(ord demo)" = "1,4,2,3" ]
}

@test "move: --top and --bottom go to the ends" {
  four
  "$CLI" move 3 --top
  [ "$(ord demo)" = "3,1,2,4" ]
  "$CLI" move 3 --bottom
  [ "$(ord demo)" = "1,2,4,3" ]
}

@test "move: writes one row and leaves the rest alone" {
  # The whole reason position is a REAL. If a drag rewrote its siblings, every
  # reorder would be a scope-wide write and the midpoint scheme would be
  # pointless.
  four
  local before after
  before=$(tq "SELECT group_concat(id || '=' || position) FROM (SELECT id, position FROM tickets WHERE id IN (1,2,4) ORDER BY id);")
  "$CLI" move 3 --top
  after=$(tq "SELECT group_concat(id || '=' || position) FROM (SELECT id, position FROM tickets WHERE id IN (1,2,4) ORDER BY id);")
  [ "$before" = "$after" ]
}

@test "move: the order survives, and list reads it back" {
  four
  "$CLI" move 4 --top
  run "$CLI" list --repo demo
  local first_line; first_line=$(echo "$output" | head -1)
  [[ "$first_line" == *"four"* ]]
}

@test "move: a target in another app is refused, exit 6" {
  # Dropping a card into another group means re-filing it, and `edit --project`
  # is the verb for that. Two gestures for one operation is worse than one each.
  "$CLI" add mine   --repo demo  >/dev/null
  "$CLI" add theirs --repo other >/dev/null
  run "$CLI" move 1 --after 2
  [ "$status" -eq 6 ]
  [[ "$output" == *"different app or project"* ]]
}

@test "move: a target in another project of the same app is refused too" {
  "$PROJECT" add "Alpha" --repo demo >/dev/null
  "$CLI" add loose  --repo demo >/dev/null
  "$CLI" add filed  --repo demo --project alpha >/dev/null
  run "$CLI" move 1 --after 2
  [ "$status" -eq 6 ]
}

@test "move: refuses to move relative to itself" {
  four
  run "$CLI" move 1 --after 1
  [ "$status" -eq 2 ]
}

@test "move: an unknown target exits 4, an unknown ticket exits 4" {
  four
  run "$CLI" move 1 --after 99
  [ "$status" -eq 4 ]
  run "$CLI" move 99 --top
  [ "$status" -eq 4 ]
}

@test "move: with no direction is a usage error" {
  four
  run "$CLI" move 1
  [ "$status" -eq 2 ]
  [[ "$output" == *"where it goes"* ]]
}

@test "move: a gap too small to halve repacks the group instead of collapsing" {
  # Two adjacent doubles have no value between them, so the midpoint would
  # round onto an endpoint and the order would quietly stop being a total one.
  # The renumber is what keeps that from happening.
  four
  tq "UPDATE tickets SET position = 1.0 WHERE id = 1;
      UPDATE tickets SET position = 1.0000000000000002 WHERE id = 2;
      UPDATE tickets SET position = 50 WHERE id = 3;
      UPDATE tickets SET position = 60 WHERE id = 4;"
  run "$CLI" move 3 --after 1
  [ "$status" -eq 0 ]
  [ "$(ord demo)" = "1,3,2,4" ]
  # Every position distinct, or the next drag has nothing to aim between.
  [ "$(tq "SELECT count(DISTINCT position) FROM tickets WHERE repo_slug='demo';")" = "4" ]
}

@test "move: re-filing through edit lands it at the bottom of its destination" {
  # A position means nothing outside its own scope, so a ticket that changes
  # app or project must be given a fresh one — otherwise it arrives carrying a
  # number from somewhere else and sorts into an arbitrary place.
  "$CLI" add a1 --repo alpha >/dev/null
  "$CLI" add a2 --repo alpha >/dev/null
  "$CLI" add b1 --repo beta  >/dev/null
  "$CLI" add b2 --repo beta  >/dev/null
  # #1 sits at position 1 in alpha; moved to beta it must not keep it.
  "$CLI" edit 1 --repo beta >/dev/null
  [ "$(ord beta)" = "3,4,1" ]
}

@test "move: filing into a project repositions even without --repo" {
  # The quiet path: naming a project settles the app too, so scope changes
  # without --repo ever being passed.
  "$PROJECT" add "Alpha" --repo demo >/dev/null
  "$CLI" add p1 --repo demo --project alpha >/dev/null
  "$CLI" add p2 --repo demo --project alpha >/dev/null
  "$CLI" add loose --repo demo >/dev/null
  # #3 is loose at position 1 of its own scope; filed into alpha it goes last.
  "$CLI" edit 3 --project alpha >/dev/null
  [ "$(tq "SELECT group_concat(id) FROM (SELECT id FROM tickets WHERE project_id IS NOT NULL ORDER BY position, id);")" = "1,2,3" ]
}

@test "move: a listing spanning scopes groups them before it sorts by position" {
  # Positions restart at 1 in every group, so a flat listing sorted on position
  # alone interleaves them — an app with a project and some loose work came out
  # 1, 3, 2, 4 as the two independent numberings took turns. Grouping first is
  # what makes the listing agree with the board rather than merely share a
  # column with it.
  "$PROJECT" add "Alpha" --repo demo >/dev/null
  "$CLI" add p1 --repo demo --project alpha >/dev/null
  "$CLI" add p2 --repo demo --project alpha >/dev/null
  "$CLI" add l1 --repo demo >/dev/null
  "$CLI" add l2 --repo demo >/dev/null
  run "$CLI" list --repo demo
  # The project's two, then the loose two — the board's own grouping.
  [ "$(echo "$output" | awk '{print $1}' | tr '\n' ' ')" = "#1 #2 #3 #4 " ]
}

@test "move: --all lists app-less ideas after every app, like the board does" {
  "$CLI" add owned --repo demo >/dev/null
  "$CLI" add an-idea --repo - >/dev/null
  run "$CLI" list --all
  [[ "$(echo "$output" | tail -1)" == *"an-idea"* ]]
}

@test "move: app-less ideas are one group, so they order against each other" {
  "$CLI" add i1 --repo - >/dev/null
  "$CLI" add i2 --repo - >/dev/null
  "$CLI" add i3 --repo - >/dev/null
  "$CLI" move 3 --top
  [ "$(tq "SELECT group_concat(id) FROM (SELECT id FROM tickets WHERE repo_slug IS NULL ORDER BY position, id);")" = "3,1,2" ]
}

# ─── status transitions ─────────────────────────────────────────────────────

@test "status: moves a ticket and rejects an unknown value" {
  "$CLI" add "x"
  run "$CLI" status 1 in_review
  [ "$status" -eq 0 ]
  [[ "$output" == *"#1 → in_review"* ]]

  run "$CLI" status 1 bogus
  [ "$status" -eq 2 ]
}

@test "done: is shorthand for shipped" {
  "$CLI" add "x"
  run "$CLI" done 1
  [ "$status" -eq 0 ]
  [[ "$output" == *"shipped"* ]]
}

@test "status/show: a missing ticket exits 4, not a generic failure" {
  run "$CLI" show 999
  [ "$status" -eq 4 ]
  run "$CLI" status 999 ready
  [ "$status" -eq 4 ]
}

@test "show: a non-numeric id is a usage error" {
  run "$CLI" show "1; DROP TABLE tickets"
  [ "$status" -eq 2 ]
  [[ "$output" == *"must be a number"* ]]
}

# ─── documents ──────────────────────────────────────────────────────────────

@test "doc: registers a document against a ticket and lists it on show" {
  "$CLI" add "x"
  run "$CLI" doc 1 --type plan --path /tmp/a-plan.md
  [ "$status" -eq 0 ]

  run "$CLI" show 1
  [[ "$output" == *"/tmp/a-plan.md"* ]]
  [[ "$output" == *"plan"* ]]
}

@test "doc: re-registering the same path is a no-op, not an error" {
  # /begin re-registers its plan on a re-run; failing there would break the
  # flow over pure bookkeeping.
  "$CLI" add "x"
  "$CLI" doc 1 --type plan --path /tmp/a-plan.md
  run "$CLI" doc 1 --type plan --path /tmp/a-plan.md
  [ "$status" -eq 0 ]

  run "$CLI" show 1 --json
  [ "$(echo "$output" | jq -r '.documents | length')" = "1" ]
}

@test "doc: '-' registers a document with no ticket attached" {
  run "$CLI" doc - --type debug --path /tmp/orphan-debug.md
  [ "$status" -eq 0 ]
  # Exit 0 alone would also pass against a cmd_doc that silently did nothing.
  run sqlite3 "$SMRITI_HOME/factory.db" "SELECT count(*) FROM documents WHERE ticket_id IS NULL;"
  [ "$output" = "1" ]
}

@test "doc: rejects an unknown type" {
  "$CLI" add "x"
  run "$CLI" doc 1 --type screenshot --path /tmp/x.png
  [ "$status" -eq 2 ]
  [[ "$output" == *"invalid --type"* ]]
}

@test "doc: deleting a ticket leaves the document row with a null ticket" {
  # Proves PRAGMA foreign_keys is actually ON for every connection — it is OFF
  # by default in sqlite3, which would make ON DELETE SET NULL silently inert.
  "$CLI" add "x"
  "$CLI" doc 1 --type plan --path /tmp/a-plan.md
  sqlite3 "$SMRITI_HOME/factory.db" ".timeout 5000" "PRAGMA foreign_keys=ON;" "DELETE FROM tickets WHERE id=1;"

  run sqlite3 "$SMRITI_HOME/factory.db" "SELECT count(*) FROM documents WHERE ticket_id IS NULL;"
  [ "$output" = "1" ]
}

# ─── current ────────────────────────────────────────────────────────────────

@test "current: emits an empty TICKET when the branch has no ticket" {
  run "$CLI" current
  [ "$status" -eq 0 ]
  # Exact match: *"TICKET="* also matches TICKET=1, so the loose form passed
  # even when a ticket was wrongly returned for a branch that has none.
  [ "$output" = "TICKET=" ]
}

@test "current: emits sourceable KEY=value for the branch's ticket" {
  "$CLI" add "Export to CSV"
  git checkout -q -b t1-export-to-csv
  sqlite3 "$SMRITI_HOME/factory.db" "UPDATE tickets SET branch='t1-export-to-csv' WHERE id=1;"

  run "$CLI" current
  [ "$status" -eq 0 ]
  [[ "$output" == *"TICKET=1"* ]]
  [[ "$output" == *"TICKET_STATUS="* ]]

  # It must be safe to eval — that is how the skill preamble consumes it.
  eval "$output"
  [ "$TICKET" = "1" ]
}

# ─── isolation + usage ──────────────────────────────────────────────────────

@test "store lives under SMRITI_HOME, never the real home dir" {
  "$CLI" add "x"
  [ -f "$SMRITI_HOME/factory.db" ]
}

@test "no args / --help: prints usage, exits 2" {
  run "$CLI"
  [ "$status" -eq 2 ]
  [[ "$output" == *"usage:"* ]]

  run "$CLI" --help
  [ "$status" -eq 2 ]
}

@test "unknown subcommand: exits 2" {
  run "$CLI" bogus
  [ "$status" -eq 2 ]
  [[ "$output" == *"unknown command"* ]]
}

# ─── worktrees ──────────────────────────────────────────────────────────────

@test "start: cuts a worktree and records the branch" {
  echo seed > f && git add f && git commit -q -m init
  "$CLI" add "Export to CSV" >/dev/null
  # Command substitution, not `run`: the worktree path is stdout and the status
  # line is stderr, and bats merges the two into $output.
  local wt; wt=$("$CLI" start 1)
  [ -d "$wt" ]
  run "$CLI" show 1
  [[ "$output" == *"t1-export-to-csv"* ]]
  [[ "$output" == *"in_progress"* ]]
}

@test "start: cutting a worktree leaves the repo clean" {
  # Worktrees live under .claude/worktrees/ inside the repo, so without an
  # exclude entry the primary reads as permanently dirty and every later
  # `smriti clean` refuses on its dirty-tree precondition.
  echo seed > f && git add f && git commit -q -m init
  "$CLI" add "Export to CSV" >/dev/null
  "$CLI" start 1 >/dev/null

  run git status --porcelain
  [ -z "$output" ]
}

@test "start: is idempotent — re-starting attaches to the same worktree" {
  echo seed > f && git add f && git commit -q -m init
  "$CLI" add "Export to CSV" >/dev/null
  local first second
  first=$("$CLI" start 1)
  second=$("$CLI" start 1)
  [ "$first" = "$second" ]
  [ "$(git worktree list | wc -l | tr -d ' ')" = "2" ]
}

@test "start: refuses to cut a worktree in an unrelated repo" {
  # Falling back to the cwd unconditionally meant `start` for app A, run from
  # repo B, silently created and recorded a worktree inside B.
  echo seed > f && git add f && git commit -q -m init
  "$CLI" add "Dark mode" --repo some-other-app >/dev/null

  run "$CLI" start 1
  [ "$status" -eq 5 ]
  [[ "$output" == *"don't know where app"* ]]
  [ ! -d "$REPO/.claude/worktrees" ]
}

@test "pr: records the url and moves the ticket to in_review" {
  "$CLI" add "Export to CSV" >/dev/null
  run "$CLI" pr 1 "https://github.com/o/r/pull/7"
  [ "$status" -eq 0 ]
  run "$CLI" show 1
  [[ "$output" == *"in_review"* ]]
  [[ "$output" == *"pull/7"* ]]
}

@test "pr: '-' is a no-op, so callers need no guard" {
  run "$CLI" pr - "https://github.com/o/r/pull/7"
  [ "$status" -eq 0 ]
}

@test "current: reading before the store exists creates no database" {
  # This runs in the preamble of every skill. Asking must not be what brings
  # the store into being.
  rm -f "$SMRITI_HOME/factory.db"
  run "$CLI" current --project demo --branch main
  [ "$status" -eq 0 ]
  [ "$output" = "TICKET=" ]
  [ ! -f "$SMRITI_HOME/factory.db" ]
}

@test "a repo path containing a space still resolves" {
  # An `eval printf` here used to silently eat the space and lose the repo.
  mkdir -p "$WORK/my repo"
  git -C "$WORK/my repo" init -q -b main
  git -C "$WORK/my repo" config user.email "test@smriti.local"
  git -C "$WORK/my repo" config user.name "smriti-test"
  git -C "$WORK/my repo" remote add origin "https://github.com/test/spaced.git"
  echo seed > "$WORK/my repo/f"
  git -C "$WORK/my repo" add f
  git -C "$WORK/my repo" commit -q -m init

  cd "$WORK/my repo"
  "$FAKE_BIN/smriti-slug" --print >/dev/null
  "$CLI" add "Export" >/dev/null
  local wt; wt=$("$CLI" start 1)
  [ -d "$wt" ]
}

@test "add: a multi-line title is refused, ordinary titles still accepted" {
  # Titles feed tab-delimited reads in `list` and `start`; a newline corrupted
  # both. The second half is the regression guard for the guard itself — the
  # first version used "$(printf '\n')", which command substitution strips to
  # an empty pattern that matched every title.
  run "$CLI" add "first
second"
  [ "$status" -eq 2 ]
  [[ "$output" == *"single line"* ]]

  run "$CLI" add "Export to CSV"
  [ "$status" -eq 0 ]
}

@test "list: reading before the store exists creates no database" {
  rm -f "$SMRITI_HOME/factory.db"
  run "$CLI" list
  [ "$status" -eq 0 ]
  [ ! -f "$SMRITI_HOME/factory.db" ]
}

# ─── edit / cancel / delete ─────────────────────────────────────────────────

@test "edit: sets a description and can clear it" {
  "$CLI" add "a thing" >/dev/null
  run "$CLI" edit 1 --body "the longer story"
  [ "$status" -eq 0 ]
  run "$CLI" show 1
  [[ "$output" == *"the longer story"* ]]

  # An explicitly empty --body clears rather than storing "".
  "$CLI" edit 1 --body ""
  run "$CLI" show 1 --json
  [ "$(echo "$output" | jq -r '.ticket.body')" = "null" ]
}

@test "edit: retitles, and still refuses a multi-line title" {
  "$CLI" add "old" >/dev/null
  "$CLI" edit 1 --title "new"
  run "$CLI" show 1
  [[ "$output" == *"new"* ]]

  run "$CLI" edit 1 --title "one
two"
  [ "$status" -eq 2 ]
}

@test "edit: with no fields is a usage error, not a silent no-op" {
  "$CLI" add "x" >/dev/null
  run "$CLI" edit 1
  [ "$status" -eq 2 ]
  [[ "$output" == *"nothing to change"* ]]
}

@test "cancel: hides it from the working view but keeps it under --all" {
  # Cancelling is 'I am not doing this', not 'this never existed' — the row and
  # its paper trail survive.
  "$CLI" add "not doing this" >/dev/null
  "$CLI" doc 1 --type plan --path /tmp/keep-me.md >/dev/null
  run "$CLI" cancel 1
  [ "$status" -eq 0 ]

  run "$CLI" list
  ! [[ "$output" == *"not doing this"* ]]
  run "$CLI" list --all
  [[ "$output" == *"cancelled"* ]]

  run "$CLI" show 1 --json
  [ "$(echo "$output" | jq -r '.documents | length')" = "1" ]
}

@test "cancel: is reversible" {
  "$CLI" add "x" >/dev/null
  "$CLI" cancel 1
  "$CLI" status 1 ready
  run "$CLI" list
  [[ "$output" == *"x"* ]]
}

@test "rm: deletes the ticket and its index rows, leaving the files alone" {
  "$CLI" add "gone" >/dev/null
  local doc="$WORK/a-plan.md"
  echo "content" > "$doc"
  "$CLI" doc 1 --type plan --path "$doc" >/dev/null

  run "$CLI" rm 1 --yes
  [ "$status" -eq 0 ]
  [[ "$output" == *"deleted: #1"* ]]

  run sqlite3 "$SMRITI_HOME/factory.db" "SELECT count(*) FROM tickets;"
  [ "$output" = "0" ]
  run sqlite3 "$SMRITI_HOME/factory.db" "SELECT count(*) FROM documents;"
  [ "$output" = "0" ]
  # The writing is the source of truth — deleting a ticket never destroys it.
  [ -f "$doc" ]
}

@test "rm: refuses without --yes in a non-interactive shell" {
  "$CLI" add "safe" >/dev/null
  run bash -c "'$CLI' rm 1 </dev/null"
  [ "$status" -eq 1 ]
  [[ "$output" == *"refusing to delete"* ]]
  run sqlite3 "$SMRITI_HOME/factory.db" "SELECT count(*) FROM tickets;"
  [ "$output" = "1" ]
}

@test "rm: unknown ticket exits 4" {
  run "$CLI" rm 999 --yes
  [ "$status" -eq 4 ]
}

@test "cancelled work sorts to the bottom, not the top" {
  # Omitting cancelled from the status order made indexOf return -1, which
  # sorted abandoned work ABOVE everything — the opposite of "park it away".
  "$CLI" add "an idea" >/dev/null
  "$CLI" add "abandoned" >/dev/null
  "$CLI" cancel 2 >/dev/null

  run "$CLI" list
  [[ "$output" == *"an idea"* ]]
  ! [[ "$output" == *"abandoned"* ]]
}

@test "priority: one validator, and it rejects SQL-shaped input" {
  # add used a looser check than edit: '0--' passed, interpolated raw, and
  # produced a sqlite syntax error with the query dumped to stderr.
  run "$CLI" add "x" --priority "0--"
  [ "$status" -eq 2 ]
  run "$CLI" add "x" --priority "1-1"
  [ "$status" -eq 2 ]
  run "$CLI" add "x" --priority 3
  [ "$status" -eq 0 ]
}

# ─── re-filing ──────────────────────────────────────────────────────────────
# "Tickets explicitly attached to projects" is only true if a ticket filed in
# the wrong place can be moved — in both directions, with its paper trail.

tdb() { sqlite3 "$SMRITI_HOME/factory.db" "$1"; }

# `worktree add` needs a commit to branch from.
seed_commit() { echo seed > f && git add f && git commit -q -m init; }

@test "edit --project: files a loose ticket into a project and infers its app" {
  "$PROJECT" add "Search v2" >/dev/null
  "$CLI" add "index it" >/dev/null

  run "$CLI" edit 1 --project search-v2
  [ "$status" -eq 0 ]
  [ "$(tdb "SELECT project_id FROM tickets WHERE id=1;")" = "1" ]
  [ "$(tdb "SELECT repo_slug FROM tickets WHERE id=1;")" = "test-demo" ]
}

@test "edit --project: the paper trail and run history follow the ticket" {
  # documents and runs each carry their OWN copy of repo_slug/project_id, so a
  # move that touched only the ticket row would strand them.
  "$PROJECT" add "Search v2" >/dev/null
  "$CLI" add "index it" >/dev/null
  "$CLI" doc 1 --type plan --path "$WORK/a-plan-1.md" >/dev/null

  "$CLI" edit 1 --project search-v2 >/dev/null
  [ "$(tdb "SELECT project_id FROM documents WHERE id=1;")" = "1" ]
}

@test "edit --no-project: takes it back out, leaving it loose in the app" {
  "$PROJECT" add "Search v2" >/dev/null
  "$CLI" add "index it" --project search-v2 >/dev/null
  "$CLI" doc 1 --type plan --path "$WORK/a-plan-1.md" >/dev/null

  run "$CLI" edit 1 --no-project
  [ "$status" -eq 0 ]
  [ "$(tdb "SELECT coalesce(project_id,'NULL') FROM tickets WHERE id=1;")" = "NULL" ]
  [ "$(tdb "SELECT coalesce(project_id,'NULL') FROM documents WHERE id=1;")" = "NULL" ]
  # It stays in the app; only the grouping was removed.
  [ "$(tdb "SELECT repo_slug FROM tickets WHERE id=1;")" = "test-demo" ]
}

@test "edit: --project and --no-project together is a usage error" {
  "$PROJECT" add "Search v2" >/dev/null
  "$CLI" add "index it" >/dev/null
  run "$CLI" edit 1 --project search-v2 --no-project
  [ "$status" -eq 2 ]
}

@test "edit --repo: moves an idea into an app" {
  cd "$WORK"
  "$CLI" add "someday" >/dev/null
  [ "$(tdb "SELECT coalesce(repo_slug,'NULL') FROM tickets WHERE id=1;")" = "NULL" ]

  run "$CLI" edit 1 --repo test-demo
  [ "$status" -eq 0 ]
  [ "$(tdb "SELECT repo_slug FROM tickets WHERE id=1;")" = "test-demo" ]
}

@test "edit --repo: refuses to move a started ticket, naming the branch" {
  seed_commit
  # Its worktree was cut in the OLD app's repo. `start` would reattach that
  # tree under the new slug and silently work in the wrong codebase.
  "$CLI" add "index it" >/dev/null
  "$CLI" start 1 >/dev/null

  run "$CLI" edit 1 --repo other-app
  [ "$status" -ne 0 ]
  [[ "$output" == *"t1-index-it"* ]]
  [[ "$output" == *"started"* ]]
  [ "$(tdb "SELECT repo_slug FROM tickets WHERE id=1;")" = "test-demo" ]
}

@test "edit --project: a started ticket can still be grouped within its own app" {
  seed_commit
  # Only the APP is immovable while a worktree exists; filing it under a
  # project in the same app moves no code.
  "$PROJECT" add "Search v2" >/dev/null
  "$CLI" add "index it" >/dev/null
  "$CLI" start 1 >/dev/null

  run "$CLI" edit 1 --project search-v2
  [ "$status" -eq 0 ]
  [ "$(tdb "SELECT project_id FROM tickets WHERE id=1;")" = "1" ]
}

@test "edit --repo: moving apps takes the old app's project off the ticket" {
  # A project belongs to exactly one app, so a ticket that carried one through
  # an app move ended up filed in a project belonging somewhere else — a row
  # every later read then has to defend against.
  "$PROJECT" add "Search v2" >/dev/null
  "$CLI" add "index it" --project search-v2 >/dev/null
  [ "$(tdb "SELECT project_id FROM tickets WHERE id=1;")" = "1" ]

  run "$CLI" edit 1 --repo other-app
  [ "$status" -eq 0 ]
  [ "$(tdb "SELECT repo_slug FROM tickets WHERE id=1;")" = "other-app" ]
  [ "$(tdb "SELECT coalesce(project_id,'NULL') FROM tickets WHERE id=1;")" = "NULL" ]
  # The paper trail follows the ticket, so it must not keep the old project either.
  [ "$(tdb "SELECT count(*) FROM documents WHERE ticket_id=1 AND project_id IS NOT NULL;")" = "0" ]
}

@test "edit --repo --project: refuses a project belonging to another app" {
  "$PROJECT" add "Other work" --repo other-app >/dev/null
  "$CLI" add "index it" >/dev/null
  # By NUMERIC id on purpose: resolve_project_ref returns a bare number without
  # any app check, so this is the path that filed a ticket across apps while
  # the slug form was already being caught by its scoping.
  pid=$(tdb "SELECT id FROM projects WHERE slug='other-work';")

  run "$CLI" edit 1 --repo test-demo --project "$pid"
  [ "$status" -eq 2 ]
  [[ "$output" == *"belonging to another app"* ]]
  [ "$(tdb "SELECT coalesce(project_id,'NULL') FROM tickets WHERE id=1;")" = "NULL" ]
  [ "$(tdb "SELECT coalesce(repo_slug,'NULL') FROM tickets WHERE id=1;")" = "test-demo" ]
}

@test "edit --repo --project: a project in the destination app is accepted" {
  "$PROJECT" add "Other work" --repo other-app >/dev/null
  "$CLI" add "index it" >/dev/null
  pid=$(tdb "SELECT id FROM projects WHERE slug='other-work';")

  run "$CLI" edit 1 --repo other-app --project "$pid"
  [ "$status" -eq 0 ]
  [ "$(tdb "SELECT repo_slug FROM tickets WHERE id=1;")" = "other-app" ]
  [ "$(tdb "SELECT project_id FROM tickets WHERE id=1;")" = "$pid" ]
}

@test "edit --project: a shared slug resolves in the ticket's own app, not the shell's" {
  # A project slug is only unique within an app. Resolving it against the app
  # you happen to be STANDING IN silently relocated the ticket whenever two
  # apps shared a project name — an app move nobody asked for.
  "$PROJECT" add "Shared Name" >/dev/null
  "$CLI" add "lives here" --project shared-name >/dev/null
  [ "$(tdb "SELECT repo_slug FROM tickets WHERE id=1;")" = "test-demo" ]

  other="$WORK/other"
  mkdir -p "$other"
  ( cd "$other" && git init -q -b main && git remote add origin "https://github.com/test/other.git" )
  ( cd "$other" && "$PROJECT" add "Shared Name" >/dev/null )

  run bash -c "cd '$other' && '$CLI' edit 1 --project shared-name"
  [ "$status" -eq 0 ]
  [ "$(tdb "SELECT repo_slug FROM tickets WHERE id=1;")" = "test-demo" ]
  [ "$(tdb "SELECT repo_slug FROM projects WHERE id=(SELECT project_id FROM tickets WHERE id=1);")" = "test-demo" ]

  # Moving between apps is what --repo is for, and naming it still works —
  # it just has to be said out loud.
  run bash -c "cd '$other' && '$CLI' edit 1 --repo test-other --project shared-name"
  [ "$status" -eq 0 ]
  [ "$(tdb "SELECT repo_slug FROM tickets WHERE id=1;")" = "test-other" ]
}

@test "status: takes all six values, cancelled included" {
  "$CLI" add "x" >/dev/null
  # cancelled has always been in VALID_STATUSES; only the usage string said
  # five, which is why the board never offered it.
  for s in idea ready in_progress in_review shipped cancelled; do
    run "$CLI" status 1 "$s"
    [ "$status" -eq 0 ]
    [ "$(tdb "SELECT status FROM tickets WHERE id=1;")" = "$s" ]
  done

  run "$CLI" status 1 archived
  [ "$status" -eq 2 ]

  # And the usage says so, so the next reader does not have to run it to find out.
  run "$CLI"
  [[ "$output" == *"in_review|shipped|cancelled"* ]]
}

@test "start: an idea with no app says what to do instead of failing obscurely" {
  cd "$WORK"
  "$CLI" add "someday" >/dev/null
  run "$CLI" start 1
  [ "$status" -eq 5 ]
  [[ "$output" == *"no app yet"* ]]
}

@test "current: reports the project a ticket belongs to" {
  seed_commit
  "$PROJECT" add "Search v2" >/dev/null
  "$CLI" add "index it" --project search-v2 >/dev/null
  "$CLI" start 1 >/dev/null

  cd "$(tdb "SELECT worktree_path FROM tickets WHERE id=1;")"
  run "$CLI" current
  [ "$status" -eq 0 ]
  # The preamble sources this, so assert on what an eval yields rather than on
  # the wire format: %q escapes the space in a project name.
  eval "$output"
  [ "$TICKET" = "1" ]
  [ "$TICKET_PROJECT" = "Search v2" ]
}

@test "edit: an empty --project is a usage error, not a silent detach" {
  # It used to read as "no project" AND, through repo_of_project(''), as "no
  # app" — so the ticket silently left its app and vanished from every view.
  "$CLI" add "bug in app" >/dev/null
  run "$CLI" edit 1 --project ""
  [ "$status" -eq 2 ]
  [[ "$output" == *"--no-project"* ]]
  [ "$(tdb "SELECT repo_slug FROM tickets WHERE id=1;")" = "test-demo" ]
}

@test "edit: an empty --repo is a usage error too" {
  "$CLI" add "bug in app" >/dev/null
  run "$CLI" edit 1 --repo ""
  [ "$status" -eq 2 ]
  [ "$(tdb "SELECT repo_slug FROM tickets WHERE id=1;")" = "test-demo" ]
}

@test "list --json: the project key is not the old project_slug" {
  # v1.2's project_slug held the REPOSITORY. Reusing that name for the project
  # would hand every existing reader a different entity without an error.
  "$CLI" add "a ticket" >/dev/null
  run "$CLI" list --json
  echo "$output" | jq -e '.[0] | has("repo_slug") and has("project_ref") and (has("project_slug") | not)'
}
