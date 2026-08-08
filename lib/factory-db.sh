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

_db_ready() {
  _require_sqlite3
  if [ ! -f "$FACTORY_DB" ]; then
    mkdir -p "$(dirname "$FACTORY_DB")"
    chmod 700 "$(dirname "$FACTORY_DB")" 2>/dev/null || true
    # journal_mode is persistent once set; its output is discarded here.
    sqlite3 "$FACTORY_DB" "PRAGMA journal_mode=WAL;" >/dev/null
  fi
  if [ ! -f "$SMRITI_LIB/factory-schema.sql" ]; then
    echo "${SMRITI_TOOL:-smriti-factory}: schema not found at $SMRITI_LIB/factory-schema.sql" >&2
    exit 3
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
