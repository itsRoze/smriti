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
# `.timeout` dot-command (no output) and journal_mode is set once at init,
# where it persists in the db file. foreign_keys must be re-set per connection
# but is silent.
_FACTORY_CONN=(".timeout 5000" "PRAGMA foreign_keys=ON;")

# Applied on every first call in a process rather than tracked by a schema
# version. Every statement in factory-schema.sql is IF NOT EXISTS, so this is
# cheap and self-healing.
_db_init() {
  [ -n "${_FACTORY_DB_READY:-}" ] && return 0
  _require_sqlite3
  mkdir -p "$(dirname "$FACTORY_DB")"
  chmod 700 "$(dirname "$FACTORY_DB")" 2>/dev/null || true

  local schema="$SMRITI_LIB/factory-schema.sql"
  if [ ! -f "$schema" ]; then
    echo "${SMRITI_TOOL:-smriti-factory}: schema not found at $schema" >&2
    exit 3
  fi
  # journal_mode is persistent once set; its output is discarded here.
  sqlite3 "$FACTORY_DB" "PRAGMA journal_mode=WAL;" ".read $schema" >/dev/null
  _FACTORY_DB_READY=1
}

db() {
  _db_init
  sqlite3 "$FACTORY_DB" "${_FACTORY_CONN[@]}" "$1"
}

db_json() {
  _db_init
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
  _db_init
  sqlite3 "$FACTORY_DB" "${_FACTORY_CONN[@]}" "BEGIN IMMEDIATE; $1 COMMIT;"
}

now_utc() { date -u +%Y-%m-%dT%H:%M:%SZ; }
