-- smriti factory — the work layer's schema.
--
-- Single source of truth. Applied idempotently by whichever helper touches
-- ~/.smriti/factory.db first; never edited in place by a migration tool. Every
-- statement must stay re-runnable (IF NOT EXISTS) because it is re-applied on
-- every db() call rather than tracked by version.
--
-- Consumers: bin/smriti-ticket (tickets, documents), bin/smriti-trace (runs,
-- events). bin/smriti-factory reads through those helpers' --json output and
-- deliberately contains no SQL, so the schema never exists in two languages.

-- Work items. One row per thing you intend to do, in any project.
CREATE TABLE IF NOT EXISTS tickets (
  id            INTEGER PRIMARY KEY,
  project_slug  TEXT    NOT NULL,
  title         TEXT    NOT NULL,
  body          TEXT,
  -- idea -> ready -> in_progress -> in_review -> shipped
  status        TEXT    NOT NULL DEFAULT 'idea',
  priority      INTEGER NOT NULL DEFAULT 0,
  branch        TEXT,
  worktree_path TEXT,
  pr_url        TEXT,
  -- local | github | linear. Only ever 'local' today; the seam a future sync
  -- adapter plugs into, costing two columns now instead of a migration later.
  origin        TEXT    NOT NULL DEFAULT 'local',
  origin_ref    TEXT,
  created_at    TEXT    NOT NULL,
  updated_at    TEXT    NOT NULL
);

-- An index of documents that live on disk. The markdown file is the source of
-- truth and is never copied in here — this table only answers "which docs
-- belong to this ticket, and where are they."
CREATE TABLE IF NOT EXISTS documents (
  id           INTEGER PRIMARY KEY,
  ticket_id    INTEGER REFERENCES tickets(id) ON DELETE SET NULL,
  project_slug TEXT    NOT NULL,
  type         TEXT    NOT NULL,        -- plan | debug | design | audit
  path         TEXT    NOT NULL UNIQUE, -- absolute path on disk
  branch       TEXT,
  created_at   TEXT    NOT NULL
);

-- One row per skill invocation that wants to be observable.
CREATE TABLE IF NOT EXISTS runs (
  id           INTEGER PRIMARY KEY,
  run_uid      TEXT    NOT NULL UNIQUE, -- referenced across processes
  ticket_id    INTEGER REFERENCES tickets(id) ON DELETE SET NULL,
  project_slug TEXT    NOT NULL,
  skill        TEXT    NOT NULL,        -- begin | debug | ship | clean
  branch       TEXT,
  status       TEXT    NOT NULL,        -- running | awaiting | done | failed
  started_at   TEXT    NOT NULL,
  ended_at     TEXT
);

-- The trace. `id` is the cursor: readers poll `WHERE id > ?` and that single
-- query serves both live tail and full history, so there is no second replay path.
CREATE TABLE IF NOT EXISTS events (
  id      INTEGER PRIMARY KEY,
  run_uid TEXT NOT NULL REFERENCES runs(run_uid) ON DELETE CASCADE,
  phase   TEXT NOT NULL,   -- ground | understand | plan | codex | approve | ...
  status  TEXT NOT NULL,   -- start | ok | fail | awaiting
  note    TEXT,
  at      TEXT NOT NULL
);

-- A live branch belongs to at most one ticket. Partial, because the many
-- not-yet-started tickets all have NULL branch and must not collide.
CREATE UNIQUE INDEX IF NOT EXISTS tickets_active_branch
  ON tickets (project_slug, branch) WHERE branch IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS tickets_worktree
  ON tickets (worktree_path) WHERE worktree_path IS NOT NULL;

CREATE INDEX IF NOT EXISTS tickets_by_project ON tickets (project_slug, status);
CREATE INDEX IF NOT EXISTS documents_by_ticket ON documents (ticket_id);
CREATE INDEX IF NOT EXISTS events_by_run ON events (run_uid, id);
CREATE INDEX IF NOT EXISTS runs_by_status ON runs (status, started_at);
