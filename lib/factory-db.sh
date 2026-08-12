# smriti factory — shared database access. Sourced, never executed.
#
# Two consumers exist today (bin/smriti-ticket, bin/smriti-trace), which is why
# this is extracted rather than inlined: SQLite's defaults are wrong for us in
# three separate ways and all three are per-connection, so every invocation has
# to re-apply them. One copy of that is the only way it stays right.
#
#   foreign_keys  defaults OFF   -> ON DELETE SET NULL would silently do nothing
#   busy_timeout  defaults 0     -> concurrent worktrees get instant SQLITE_BUSY
#   journal_mode  defaults delete-> WAL lets the TUI read while a run writes
#
# Usage:
#   . "$SMRITI_LIB/factory-db.sh"
#   db "SELECT ..."            # query, newline-separated rows
#   db_json "SELECT ..."       # query, JSON array
#   db_write "INSERT ..."      # statement(s), inside a transaction
#   sql_quote "$value"         # -> 'escaped literal', safe to interpolate

FACTORY_DB="${SMRITI_HOME:-$HOME/.smriti}/factory.db"

# Values are embedded as SQL string literals with ' doubled. The sqlite3 CLI's
# `.param set` cannot be used instead: it is a line-oriented dot-command and
# corrupts any value containing a newline, which ticket bodies routinely do.
# Doubling is the complete escape for SQL string literals — newlines, quotes,
# semicolons and unicode all round-trip verbatim.
sql_quote() {
  printf "'%s'" "$(printf '%s' "$1" | sed "s/'/''/g")"
}

# NULL when empty, quoted literal otherwise. For nullable columns where an
# empty string and "unset" mean different things (branch, pr_url, ticket_id).
sql_quote_or_null() {
  if [ -z "$1" ]; then printf 'NULL'; else sql_quote "$1"; fi
}

_require_sqlite3() {
  command -v sqlite3 >/dev/null 2>&1 && return 0
  echo "${SMRITI_TOOL:-smriti-factory}: sqlite3 not found — install it (macOS ships it at /usr/bin/sqlite3; Debian: apt install sqlite3)" >&2
  exit 3
}

# Per-connection settings, chosen to be SILENT. `PRAGMA busy_timeout=N` and
# `PRAGMA journal_mode=WAL` both echo their new value to stdout, which would
# contaminate the result of every single query — so busy_timeout is set via the
# `.timeout` dot-command (no output) and journal_mode is set once at creation,
# where it persists in the db file. foreign_keys must be re-set per connection
# but is silent.
#
# The schema is applied on the SAME connection as the query rather than by a
# separate `_db_init` invocation. Every statement in factory-schema.sql is
# IF NOT EXISTS, and re-reading the file costs ~0.2ms against ~7ms to spawn
# another sqlite3 — so folding it in here halves the process count of every
# command while keeping the self-healing property. (A shell-variable memo does
# not work: `x=$(db ...)` runs in a subshell, so the flag never survives.)
_factory_conn_args() {
  _FACTORY_CONN=(".timeout 5000" "PRAGMA foreign_keys=ON;" ".read $SMRITI_LIB/factory-schema.sql")
}

# ─── migration ──────────────────────────────────────────────────────────────
#
# factory-schema.sql can only CREATE. Reshaping a table that already exists
# needs SQLite's rebuild dance, and that is what this does — once, ever.
#
# The schema version lives in the DATABASE, as `PRAGMA user_version`, not in a
# sibling marker file. A marker is faster to read, but it can desynchronise from
# the thing it describes — restore a pre-upgrade backup of factory.db, or sync
# the file between machines, and the marker still says "current" while the data
# is not. Every command then fails with `no such column: repo_slug` and the only
# cure is deleting a dotfile the user has no reason to know exists.
#
# Reading it costs one sqlite3 invocation (~4ms against ~16ms for a whole
# `ticket list`). That is the price of a version that cannot lie, and it is also
# what let v3 be added without guesswork about what any given store already has.
FACTORY_SCHEMA_VERSION=4

# The store's schema version. Three answers, and they must stay distinct:
# a number, or failure — because "could not read it" is not "it is current".
# Collapsing those two is how a database that was merely locked at the wrong
# moment gets recorded as migrated and then never is.
_db_version() {
  local v
  v=$(sqlite3 "$FACTORY_DB" ".timeout 10000" "PRAGMA user_version;" 2>/dev/null) || return 1
  case "$v" in
    ''|*[!0-9]*) return 1 ;;
  esac
  printf '%s' "$v"
}

# Every migration step, newest last, run under ONE lock and stamped ONCE at the
# end. The steps are guarded on the shape they change rather than on the version
# they came from, so a database at any older version — or at a mixed shape from
# an interrupted upgrade — converges by running only what it is actually missing.
#
# The single stamp is load-bearing. When each step stamped for itself, adding a
# v3 step meant a v2-shaped database took the v2 path, got stamped 3, and never
# gained the v3 column at all: the version said current while the shape was not.
_db_migrate() {
  # Serialised with a directory lock: `mkdir` is atomic, so exactly one process
  # migrates. Without it two worktrees reaching a cold store at once both pass
  # the guard, and the loser's transaction then runs against tables the winner
  # already rebuilt — failing on a column that no longer exists and reporting a
  # migration failure for a database that is in fact perfectly fine.
  #
  # It is also what makes the v3 column probe safe: probe-then-ALTER is a
  # read-modify-write, and two upgraders passing the probe together would leave
  # the loser failing on `duplicate column`.
  local lock="${SMRITI_HOME:-$HOME/.smriti}/.factory-migrating"
  local waited=0
  while ! mkdir "$lock" 2>/dev/null; do
    waited=$((waited + 1))
    # A lock older than the wait budget is a corpse from a hard kill, not a
    # peer: clear it rather than blocking every future invocation forever.
    if [ "$waited" -gt 300 ]; then rmdir "$lock" 2>/dev/null || true; continue; fi
    sleep 0.1
  done

  # Re-read now that we hold the lock: whoever we queued behind may have done
  # the work already, in which case there is nothing left to do.
  local v
  if ! v=$(_db_version); then
    rmdir "$lock" 2>/dev/null || true
    return 1
  fi
  if [ "$v" -ge "$FACTORY_SCHEMA_VERSION" ]; then
    rmdir "$lock" 2>/dev/null || true
    return 0
  fi

  # ── step v2: project_slug → repo_slug + project_id ──────────────────────
  #
  # Version says old, but is the shape actually old? A database can be at the
  # new shape with an unstamped version — one built by a pre-release of this
  # change, or reshaped by hand. Running the rebuild against it would fail on a
  # column that is already gone, so skip to the next step instead.
  local pending
  pending=$(sqlite3 "$FACTORY_DB" ".timeout 10000" \
    "SELECT count(*) FROM pragma_table_info('tickets') WHERE name='project_slug';" 2>/dev/null) || {
      rmdir "$lock" 2>/dev/null || true; return 1; }
  if [ "$pending" = "1" ]; then _db_migrate_step_v2 "$lock"; fi

  # ── step v3: runs.html_session ──────────────────────────────────────────
  #
  # A pure column add, so ALTER TABLE rather than the rebuild above — and
  # deliberately so. Other /begin sessions write runs and events to this same
  # database while we are here, and a table rebuild under concurrent writers can
  # lose rows or orphan events. ADD COLUMN is metadata-only: it takes a brief
  # write lock and touches no row.
  #
  # Guarded on the TABLE as well as the column. A stamped-but-tableless
  # factory.db is reachable — the version is stamped at file creation while the
  # tables are only applied on the first query — and ALTERing a table that is
  # not there would exit 3 on every command forever, with the real error hidden
  # by the 2>/dev/null. Nothing to alter is not a failure: factory-schema.sql
  # creates `runs` WITH the column a moment later.
  local has_runs has_html
  has_runs=$(sqlite3 "$FACTORY_DB" ".timeout 10000" \
    "SELECT count(*) FROM sqlite_master WHERE type='table' AND name='runs';" 2>/dev/null) || {
      rmdir "$lock" 2>/dev/null || true; return 1; }
  has_html=$(sqlite3 "$FACTORY_DB" ".timeout 10000" \
    "SELECT count(*) FROM pragma_table_info('runs') WHERE name='html_session';" 2>/dev/null) || {
      rmdir "$lock" 2>/dev/null || true; return 1; }
  if [ "$has_runs" = "1" ] && [ "$has_html" != "1" ]; then
    # `return 1`, not `exit 3`, matching every other failure in this function:
    # the caller reports it and the store is left exactly as it was.
    sqlite3 "$FACTORY_DB" ".timeout 10000" \
      "ALTER TABLE runs ADD COLUMN html_session TEXT;" >/dev/null 2>&1 || {
        rmdir "$lock" 2>/dev/null || true; return 1; }
  fi

  # ── step v4: tickets.position ───────────────────────────────────────────
  #
  # Another pure column add, guarded on table and column exactly like v3 above,
  # and for the same reasons.
  #
  # What makes this one different is the seed that follows the ALTER. A bare
  # `DEFAULT 0` would give every ticket the same position, and the board — which
  # sorts on it from here on — would fall back to id order and reshuffle itself
  # under someone who never asked for that. So the seed reproduces the order the
  # board was ALREADY drawing: status band first, then priority descending, then
  # id. Migrate, and nothing moves until you drag something.
  #
  # It is deliberately scoped by (repo_slug, project_id) with coalesce on both:
  # that pair is the group the board draws, positions are only ever compared
  # inside one, and NULL = NULL is not true in SQL so the app-less ideas bucket
  # would otherwise partition into one group per row.
  #
  # `smriti ticket list` sorted priority-then-id with no band, so its order DOES
  # change here — it adopts the board's. That is the point rather than a side
  # effect: ticket #11 asked for one authoritative order, and this is the board
  # winning.
  local has_tickets has_position
  has_tickets=$(sqlite3 "$FACTORY_DB" ".timeout 10000" \
    "SELECT count(*) FROM sqlite_master WHERE type='table' AND name='tickets';" 2>/dev/null) || {
      rmdir "$lock" 2>/dev/null || true; return 1; }
  has_position=$(sqlite3 "$FACTORY_DB" ".timeout 10000" \
    "SELECT count(*) FROM pragma_table_info('tickets') WHERE name='position';" 2>/dev/null) || {
      rmdir "$lock" 2>/dev/null || true; return 1; }
  if [ "$has_tickets" = "1" ] && [ "$has_position" != "1" ]; then
    # One statement, so an interrupted migration cannot leave the column added
    # but unseeded — which would read as "every ticket at position 0" and is
    # exactly the reshuffle the seed exists to prevent.
    sqlite3 "$FACTORY_DB" ".timeout 10000" \
      "ALTER TABLE tickets ADD COLUMN position REAL NOT NULL DEFAULT 0;
       WITH seeded AS (
         SELECT id, ROW_NUMBER() OVER (
           PARTITION BY coalesce(repo_slug, ''), coalesce(project_id, -1)
           ORDER BY CASE status
                      WHEN 'in_review'   THEN 0
                      WHEN 'in_progress' THEN 1
                      WHEN 'ready'       THEN 2
                      WHEN 'idea'        THEN 3
                      WHEN 'shipped'     THEN 4
                      ELSE 5
                    END,
                    priority DESC, id ASC
         ) AS rn
         FROM tickets
       )
       UPDATE tickets SET position = (SELECT rn FROM seeded WHERE seeded.id = tickets.id);" \
      >/dev/null 2>&1 || {
        rmdir "$lock" 2>/dev/null || true; return 1; }
  fi

  # Only now, with every step applied, does the version become current.
  sqlite3 "$FACTORY_DB" ".timeout 10000" "PRAGMA user_version = $FACTORY_SCHEMA_VERSION;" >/dev/null 2>&1 || {
    rmdir "$lock" 2>/dev/null || true; return 1; }
  rmdir "$lock" 2>/dev/null || true
}

# The v1 → v2 table rebuild. Called with the lock held; exits the process on
# failure the way it always has, so its caller never sees a half-applied shape.
_db_migrate_step_v2() {
  local lock="$1"
  # foreign_keys OFF so dropping runs does not cascade events away, and
  # legacy_alter_table ON so RENAME TO does not rewrite the REFERENCES clauses
  # of the tables still pointing at the old names mid-flight. Both are no-ops
  # inside a transaction, hence before BEGIN.
  sqlite3 "$FACTORY_DB" \
    ".timeout 10000" \
    "PRAGMA foreign_keys=OFF;" \
    "PRAGMA legacy_alter_table=ON;" \
    "BEGIN IMMEDIATE;

     CREATE TABLE IF NOT EXISTS repositories (
       slug TEXT PRIMARY KEY, name TEXT, description TEXT,
       created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
     CREATE TABLE IF NOT EXISTS projects (
       id INTEGER PRIMARY KEY,
       repo_slug TEXT,
       slug TEXT NOT NULL, name TEXT NOT NULL, description TEXT,
       status TEXT NOT NULL DEFAULT 'active',
       created_at TEXT NOT NULL, updated_at TEXT NOT NULL);

     INSERT OR IGNORE INTO repositories (slug, name, created_at, updated_at)
       SELECT s, s, strftime('%Y-%m-%dT%H:%M:%SZ','now'), strftime('%Y-%m-%dT%H:%M:%SZ','now')
       FROM (SELECT DISTINCT project_slug AS s FROM tickets   WHERE project_slug IS NOT NULL AND project_slug <> ''
             UNION SELECT DISTINCT project_slug FROM documents WHERE project_slug IS NOT NULL AND project_slug <> ''
             UNION SELECT DISTINCT project_slug FROM runs      WHERE project_slug IS NOT NULL AND project_slug <> '');

     CREATE TABLE tickets_v2 (
       id INTEGER PRIMARY KEY, repo_slug TEXT,
       project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
       title TEXT NOT NULL, body TEXT,
       status TEXT NOT NULL DEFAULT 'idea', priority INTEGER NOT NULL DEFAULT 0,
       branch TEXT, worktree_path TEXT, pr_url TEXT,
       origin TEXT NOT NULL DEFAULT 'local', origin_ref TEXT,
       created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
     INSERT INTO tickets_v2 (id, repo_slug, project_id, title, body, status, priority,
                             branch, worktree_path, pr_url, origin, origin_ref, created_at, updated_at)
       SELECT id, nullif(project_slug,''), NULL, title, body, status, priority,
              branch, worktree_path, pr_url, origin, origin_ref, created_at, updated_at FROM tickets;

     CREATE TABLE documents_v2 (
       id INTEGER PRIMARY KEY,
       ticket_id INTEGER REFERENCES tickets(id) ON DELETE SET NULL,
       repo_slug TEXT,
       project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
       type TEXT NOT NULL, path TEXT NOT NULL UNIQUE, branch TEXT, created_at TEXT NOT NULL);
     INSERT INTO documents_v2 (id, ticket_id, repo_slug, project_id, type, path, branch, created_at)
       SELECT id, ticket_id, nullif(project_slug,''), NULL, type, path, branch, created_at FROM documents;

     CREATE TABLE runs_v2 (
       id INTEGER PRIMARY KEY, run_uid TEXT NOT NULL UNIQUE,
       ticket_id INTEGER REFERENCES tickets(id) ON DELETE SET NULL,
       repo_slug TEXT,
       project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
       skill TEXT NOT NULL, branch TEXT, status TEXT NOT NULL,
       started_at TEXT NOT NULL, ended_at TEXT);
     INSERT INTO runs_v2 (id, run_uid, ticket_id, repo_slug, project_id, skill, branch, status, started_at, ended_at)
       SELECT id, run_uid, ticket_id, nullif(project_slug,''), NULL, skill, branch, status, started_at, ended_at FROM runs;

     DROP TABLE tickets;   ALTER TABLE tickets_v2   RENAME TO tickets;
     DROP TABLE documents; ALTER TABLE documents_v2 RENAME TO documents;
     DROP TABLE runs;      ALTER TABLE runs_v2      RENAME TO runs;

     COMMIT;" || {
      rmdir "$lock" 2>/dev/null || true
      echo "${SMRITI_TOOL:-smriti-factory}: factory.db migration failed; the database is unchanged" >&2
      echo "${SMRITI_TOOL:-smriti-factory}: it is a single transaction, so nothing was half-applied." >&2
      exit 3
    }
  # Deliberately does NOT release the lock or stamp the version: _db_migrate
  # owns both, and later steps still have to run under the same lock.
}

_db_ready() {
  _require_sqlite3
  if [ ! -f "$FACTORY_DB" ]; then
    mkdir -p "$(dirname "$FACTORY_DB")"
    chmod 700 "$(dirname "$FACTORY_DB")" 2>/dev/null || true
    # journal_mode is persistent once set; its output is discarded here.
    # A database this process just created is born at the current shape, and
    # records that in its own header rather than in a file beside it.
    sqlite3 "$FACTORY_DB" \
      "PRAGMA journal_mode=WAL; PRAGMA user_version = $FACTORY_SCHEMA_VERSION;" >/dev/null
  fi
  if [ ! -f "$SMRITI_LIB/factory-schema.sql" ]; then
    echo "${SMRITI_TOOL:-smriti-factory}: schema not found at $SMRITI_LIB/factory-schema.sql" >&2
    exit 3
  fi
  # Read the version from the database itself. A read that FAILS is not
  # permission to carry on: falling through would run new SQL against an old
  # shape, so say what is wrong instead of erroring column by column.
  local _v
  if ! _v=$(_db_version); then
    echo "${SMRITI_TOOL:-smriti-factory}: cannot read $FACTORY_DB (locked, or not a database?)" >&2
    exit 3
  fi
  if [ "$_v" -lt "$FACTORY_SCHEMA_VERSION" ]; then
    _db_migrate || {
      echo "${SMRITI_TOOL:-smriti-factory}: $FACTORY_DB needs migrating to schema v$FACTORY_SCHEMA_VERSION but the attempt did not complete." >&2
      exit 3
    }
  fi
  _factory_conn_args
}

# True when the store exists. Read-only callers use this to answer "nothing
# here" without creating a database as a side effect of asking.
factory_db_exists() { [ -f "$FACTORY_DB" ]; }

db() {
  _db_ready
  sqlite3 "$FACTORY_DB" "${_FACTORY_CONN[@]}" "$1"
}

db_json() {
  _db_ready
  # sqlite3 -json prints nothing at all for a zero-row result; normalize to an
  # empty array so callers can hand the value straight to jq.
  local out
  out=$(sqlite3 -json "$FACTORY_DB" "${_FACTORY_CONN[@]}" "$1")
  [ -z "$out" ] && out='[]'
  printf '%s\n' "$out"
}

# Wrapped so a multi-statement write either lands whole or not at all. Any
# SELECT the caller appends (e.g. last_insert_rowid()) is returned on stdout —
# it must share this connection, since that value is per-connection.
db_write() {
  _db_ready
  sqlite3 "$FACTORY_DB" "${_FACTORY_CONN[@]}" "BEGIN IMMEDIATE; $1 COMMIT;"
}

# Read one value per statement into $DB_FIELDS, preserving empty strings.
#
# The obvious alternative — concatenate the columns with a separator and split
# with `read` — is wrong twice over, and both failures are silent:
#
#   - `IFS=$'\t' read` cannot be used, because tab is IFS *whitespace*: bash
#     collapses runs of it and strips a leading one. A ticket with no app has an
#     empty first column, so every field then shifted left and `ticket start`
#     read the ticket's TITLE as its app slug.
#   - a non-printable separator does not fix it: the sqlite3 CLI renders control
#     characters on output (char(31) arrives as the two printable bytes "^_"),
#     so there is no byte left to split on.
#
# One statement per field, one line per value, no separator to get wrong.
# `while read` rather than mapfile: macOS ships bash 3.2, which has no mapfile.
db_fields() {
  DB_FIELDS=()
  local _line
  while IFS= read -r _line; do DB_FIELDS+=("$_line"); done < <(db "$1")
}

# One row, as a bare JSON object (or `null`). Both helpers were hand-splicing a
# single-row array with sed to build their `show --json` output.
db_json_one() {
  local out
  out=$(db_json "$1")
  printf '%s\n' "$(printf '%s' "$out" | sed 's/^\[//; s/\]$//')"
}

now_utc() { date -u +%Y-%m-%dT%H:%M:%SZ; }

# ─── shared helper shapes ───────────────────────────────────────────────────
# Both consumers need these identically; keeping one copy is what stops the two
# from drifting the way their first versions already had.

die() { echo "${SMRITI_TOOL:-smriti-factory}: $1" >&2; exit "${2:-2}"; }

require_num() {
  case "$1" in
    ''|*[!0-9]*) die "${2:-value} must be a number, got '$1'" ;;
  esac
}

# Gated on actually being in a repo: smriti-slug falls back to `path-<hash>` of
# the cwd when there is no repo, which would silently file work under a
# meaningless project rather than telling the user to name one.
current_slug() {
  git rev-parse --show-toplevel >/dev/null 2>&1 || return 0
  if [ -x "$SMRITI_BIN/smriti-slug" ]; then
    "$SMRITI_BIN/smriti-slug" --print 2>/dev/null || true
  elif command -v smriti-slug >/dev/null 2>&1; then
    smriti-slug --print 2>/dev/null || true
  fi
}

current_branch() { git branch --show-current 2>/dev/null || true; }

# Where does this app live on disk? The slug-cache already maps repo paths to
# slugs, so it is read in reverse rather than adding a second registry — which
# is also why `repositories` has no repo_path column: one authority, and it is
# refreshed by smriti-slug on every invocation. Prefers a path that still
# exists and is a primary worktree.
repo_path_for_slug() {
  local want="$1" cache_dir="${SMRITI_HOME:-$HOME/.smriti}/slug-cache" f slug path fallback=""
  [ -n "$want" ] || return 0
  [ -d "$cache_dir" ] || return 0
  for f in "$cache_dir"/*; do
    [ -f "$f" ] || continue
    slug=$(grep -E '^SLUG=' "$f" 2>/dev/null | tail -1 | cut -d= -f2-)
    [ "$slug" = "$want" ] || continue
    # Written by smriti-slug with plain %s — no shell quoting to undo. An
    # earlier `eval printf` here silently ate spaces in repo paths.
    path=$(grep -E '^SOURCE_PATH=' "$f" 2>/dev/null | tail -1 | cut -d= -f2-)
    [ -d "$path" ] || continue
    # A primary worktree has .git as a directory; linked ones have a .git file.
    if [ -d "$path/.git" ]; then printf '%s' "$path"; return 0; fi
    [ -z "$fallback" ] && fallback="$path"
  done
  # "No path known" is an ANSWER, not a failure. Ending on a bare
  # `[ -n "$fallback" ] && printf ...` made the function return 1 in that case,
  # and under `set -e` a caller's `path=$(repo_path_for_slug ...)` then aborted
  # the whole command — silently, with no output and exit 1.
  if [ -n "$fallback" ]; then printf '%s' "$fallback"; fi
  return 0
}

# Branch/dir-safe form of a title or name: "Export to CSV!" -> "export-to-csv".
slugify() {
  printf '%s' "$1" \
    | tr 'A-Z' 'a-z' \
    | tr -cs 'a-z0-9' '-' \
    | sed -E 's/^-+//; s/-+$//' \
    | cut -c1-40 \
    | sed -E 's/-+$//'
}

# A slug that is safe to use as a path segment and as a URL segment. Rejecting
# beats sanitising: a silently-rewritten slug is one you cannot find again.
validate_slug_shape() {
  local slug="$1" label="${2:-slug}"
  case "$slug" in
    ''|*/*|.*) die "invalid $label '$slug' (must not be empty, contain '/', or start with '.')" ;;
    _archive)  die "'$slug' is a reserved name" ;;
  esac
  case "$slug" in
    *[!a-zA-Z0-9._-]*) die "invalid $label '$slug' (letters, digits, '.', '_' and '-' only)" ;;
  esac
}
