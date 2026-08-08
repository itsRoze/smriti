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
  ln -s "$ROOT/bin/smriti-ticket" "$FAKE_BIN/smriti-ticket"
  ln -s "$ROOT/bin/smriti-slug"   "$FAKE_BIN/smriti-slug"
  CLI="$FAKE_BIN/smriti-ticket"

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

@test "add: outside a git repo requires --project" {
  cd "$WORK"
  run "$CLI" add "orphan"
  [ "$status" -eq 2 ]
  [[ "$output" == *"--project"* ]]

  run "$CLI" add "orphan" --project other-thing
  [ "$status" -eq 0 ]
  [[ "$output" == *"other-thing"* ]]
}

@test "add: rejects a project name that could escape the store" {
  run "$CLI" add "x" --project "../evil"
  [ "$status" -eq 2 ]
  [[ "$output" == *"invalid project"* ]]
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

@test "list: scopes to the current repo, --all crosses projects" {
  "$CLI" add "mine"
  "$CLI" add "theirs" --project other-project

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
  echo "$output" | jq -e '.[0] | .id and .title and .status and .project_slug'
  [ "$(echo "$output" | jq -r '.[0].title')" = "Export to CSV" ]
}

@test "list: --json on an empty store is a valid empty array" {
  run "$CLI" list --json
  [ "$status" -eq 0 ]
  [ "$(echo "$output" | jq -r 'length')" = "0" ]
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
  [[ "$output" == *"TICKET="* ]]
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
  # Falling back to the cwd unconditionally meant `start` for project A, run
  # from repo B, silently created and recorded a worktree inside B.
  echo seed > f && git add f && git commit -q -m init
  "$CLI" add "Dark mode" --project some-other-project >/dev/null

  run "$CLI" start 1
  [ "$status" -eq 5 ]
  [[ "$output" == *"don't know where project"* ]]
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
  [[ "$output" == *"TICKET="* ]]
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
