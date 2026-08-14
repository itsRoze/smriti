-- smriti factory — the work layer's schema.
--
-- Single source of truth for the CURRENT shape. Applied idempotently by
-- whichever helper touches ~/.smriti/factory.db first. Every statement must
-- stay re-runnable (IF NOT EXISTS) because it is re-applied on every db() call
-- rather than tracked by version.
--
-- This file only ever CREATES. Changing the shape of a table that already
-- exists is beyond what an IF NOT EXISTS file can do, so that lives in
-- _db_migrate() in lib/factory-db.sh — guarded, one-shot, and skipped entirely
-- in steady state. The two work together: the migration brings an old database
-- up to this shape, and this file fills in whatever is still missing.
--
-- Consumers: bin/smriti-repo (repositories), bin/smriti-project (projects),
-- bin/smriti-ticket (tickets, documents), bin/smriti-trace (runs, events).
-- bin/smriti-factory and bin/smriti-board read through those helpers' --json
-- output and deliberately contain no SQL, so the schema never exists in two
-- languages.

-- ─── the entities ──────────────────────────────────────────────────────────
--
--   repository (an app) ──< project ──< ticket ──< document
--                       └──────────────< ticket (loose, no project)
--                                        ticket (an idea: no repo, no project)
--
-- Both edges are optional on purpose. A one-off bug belongs to an app but to no
-- project; an idea belongs to neither and can be captured from anywhere.

-- An app. Identity is the slug bin/smriti-slug derives from the git remote,
-- so this table never invents one — it only hangs attributes off a slug that
-- the rest of smriti already resolves from the repo you are standing in.
CREATE TABLE IF NOT EXISTS repositories (
  slug        TEXT PRIMARY KEY,
  name        TEXT,
  description TEXT,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

-- A named body of work. Lives in one repository, or in none while it is still
-- just an idea. Never spans two repositories: work that crosses apps is two
-- projects, not one.
--
-- repo_slug carries NO foreign key, exactly like tickets.repo_slug — an app
-- exists whether or not anyone has described it, so requiring a parent row
-- would make `project add` fail in a repo you had simply never edited. It also
-- keeps `repo forget` honest: that deletes the attributes row and deliberately
-- keeps the work, which an ON DELETE SET NULL would have quietly undone by
-- detaching every project from its app.
CREATE TABLE IF NOT EXISTS projects (
  id          INTEGER PRIMARY KEY,
  repo_slug   TEXT,
  slug        TEXT    NOT NULL,        -- handle for the CLI and #/p/<slug>
  name        TEXT    NOT NULL,
  description TEXT,
  status      TEXT    NOT NULL DEFAULT 'active',   -- active | done | archived
  created_at  TEXT    NOT NULL,
  updated_at  TEXT    NOT NULL
);

-- Work items. One row per thing you intend to do, anywhere.
CREATE TABLE IF NOT EXISTS tickets (
  id            INTEGER PRIMARY KEY,
  -- NULL for an idea that has no app yet. Was called project_slug until
  -- projects became a real entity; it always held a repository.
  repo_slug     TEXT,
  -- NULL for a one-off: a bug in the app that is not part of any project.
  project_id    INTEGER REFERENCES projects(id) ON DELETE SET NULL,
  title         TEXT    NOT NULL,
  body          TEXT,
  -- idea -> ready -> in_progress -> in_review -> shipped
  status        TEXT    NOT NULL DEFAULT 'idea',
  -- How important you called it. Deliberately NOT the sort key: importance and
  -- sequence are different questions, and overloading one column with both
  -- means dragging a card silently rewrites how important it is.
  priority      INTEGER NOT NULL DEFAULT 0,
  -- Where it sits in the order you intend to work it. Only ever compared
  -- against tickets in the same (repo_slug, project_id) scope — the group the
  -- board draws it in — and meaningless across scopes.
  --
  -- REAL, not INTEGER, so a card dropped between two others takes the midpoint
  -- of its neighbours: one row written per move, never a renumbering cascade.
  -- `ticket move` renormalises a scope to whole numbers when a gap has been
  -- subdivided into the ground.
  position      REAL    NOT NULL DEFAULT 0,
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

-- Which work has to land before which other work. One row says exactly one
-- thing: blocker_id must land before blocked_id can start.
--
-- A TABLE rather than a column on tickets, because the relationship is
-- many-to-many in both directions: a ticket can block several and be blocked by
-- several. #4 in this repo's own backlog already names two blockers in prose.
--
-- Edges may cross projects AND apps on purpose. "The API ticket blocks the UI
-- ticket" is the common case and the two often live in different repositories,
-- so nothing here is scoped the way `position` is. The cost is that a reader
-- cannot assume both ends are on screen, which is the board's problem to solve
-- and not a reason to forbid the edge.
--
-- ON DELETE CASCADE, where every other table here uses SET NULL. The difference
-- is that those are optional ATTRIBUTES of a row — a ticket with no project is
-- still a ticket. An edge with one end missing is not a weaker edge, it is not
-- an edge, and leaving it would strand its survivor blocked by a ticket that no
-- longer exists with no way to see why. It does mean deleting a ticket changes
-- OTHER tickets' state, which is why `ticket rm` counts the edges out loud.
--
-- No status column. Blocked / unblocked / freed are derived on every read from
-- the blockers' own statuses, so un-cancelling a blocker re-blocks its
-- dependents with nothing to reconcile. `cancel` is advertised as reversible;
-- a stored flag would quietly have failed to come back with it.
CREATE TABLE IF NOT EXISTS ticket_deps (
  blocker_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  blocked_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  created_at TEXT    NOT NULL,
  -- Drawing the same edge twice is a no-op rather than a duplicate row.
  PRIMARY KEY (blocker_id, blocked_id)
);

-- The documents themselves — plans, debug write-ups, design notes. This table
-- USED to be an index into files on disk, and the file used to be the source of
-- truth. It is not any more: `smriti clean` deletes those files when a branch
-- merges, so the record died at exactly the moment the work succeeded.
--
-- The body lives here. The file on disk is a WORKING COPY — the thing being
-- edited while a run is live, because authoring and reviewing both need a real
-- path. One authority with a clear handover: the file wins while it exists, this
-- table wins once it is gone. They can never disagree, because every read syncs
-- from disk first (`ticket doc-show`) and `smriti clean` deletes only the files
-- it has already stored.
CREATE TABLE IF NOT EXISTS documents (
  id           INTEGER PRIMARY KEY,
  ticket_id    INTEGER REFERENCES tickets(id) ON DELETE SET NULL,
  repo_slug    TEXT,
  project_id   INTEGER REFERENCES projects(id) ON DELETE SET NULL,
  type         TEXT    NOT NULL,        -- plan | debug | design | audit
  -- Where the working copy lives, or lived. Still the identity key for
  -- re-registration; NO LONGER a promise that a file is there.
  path         TEXT    NOT NULL UNIQUE,
  branch       TEXT,
  created_at   TEXT    NOT NULL,
  -- The markdown itself. NULL until first captured — a document registered
  -- before its file was written has a row and no body yet, which is a normal
  -- state and distinct from an error.
  body         TEXT,
  -- When `body` was last taken from disk. NULL means never captured.
  captured_at  TEXT
);

-- Pictures pasted into a description — a screenshot of the bug, a mockup, a
-- photo of something on paper. The bytes live HERE, for the same reason
-- `documents.body` does: anything kept on disk outside this file is something a
-- later cleanup deletes without knowing what it was, and copying factory.db
-- has to keep meaning "I have the whole factory".
--
-- Attached to NOTHING on purpose. A photo is referenced only by the text that
-- mentions it — `![alt](smriti://photo/<id>)` — and that text may be a ticket
-- body, a project or app description, or a stored document. A foreign key to
-- any one of them would be a lie about the other three, and cascading from a
-- ticket would delete a picture another description is still showing.
--
-- AUTOINCREMENT, the one place in this schema that needs it. A bare INTEGER
-- PRIMARY KEY hands a deleted row's id to the next insert, and ids here are
-- cached permanently by the browser: delete #12, paste a new photo, and every
-- description referring to #12 would show the new picture from cache. The
-- sqlite_sequence row this costs is the price of ids that are never reused.
CREATE TABLE IF NOT EXISTS photos (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  -- Content fingerprint. UNIQUE, so pasting the same screenshot into three
  -- descriptions stores it once and all three point at one row.
  sha256     TEXT    NOT NULL UNIQUE,
  -- image/png | image/jpeg | image/gif | image/webp. Determined by sniffing the
  -- leading bytes, never from what a caller declared — an SVG is a program, and
  -- this renders inside the board.
  mime       TEXT    NOT NULL,
  bytes      INTEGER NOT NULL,
  data       BLOB    NOT NULL,
  created_at TEXT    NOT NULL
);

-- One row per skill invocation that wants to be observable.
CREATE TABLE IF NOT EXISTS runs (
  id           INTEGER PRIMARY KEY,
  run_uid      TEXT    NOT NULL UNIQUE, -- referenced across processes
  ticket_id    INTEGER REFERENCES tickets(id) ON DELETE SET NULL,
  repo_slug    TEXT,
  project_id   INTEGER REFERENCES projects(id) ON DELETE SET NULL,
  skill        TEXT    NOT NULL,        -- begin | debug | ship | clean
  branch       TEXT,
  status       TEXT    NOT NULL,        -- running | awaiting | done | failed
  started_at   TEXT    NOT NULL,
  ended_at     TEXT,
  -- The `smriti html` session this run's CURRENT gate is served on, so the
  -- board can click a "waiting on you" row straight through to the live review.
  -- The id only; the port is deliberately not stored, because it dies with the
  -- server and a link built from a remembered port is a link to nothing. Only
  -- ever meaningful while status = 'awaiting' — every event rewrites it, and
  -- `trace end` clears it.
  html_session TEXT,
  -- The herdr pane this run is executing in, read from $HERDR_PANE_ID at
  -- `trace start`. herdr injects it into every managed pane, so the run knows
  -- its own pane exactly and nothing has to match on anything.
  --
  -- It is here so the board can find a finished run's session AFTER `smriti
  -- clean` has deleted the worktree, which is the only other handle there was.
  -- It also keeps that lookup off herdr's agent NAMES, which are machine-global
  -- (`t<id>`) and have already let a test fixture collide with a real session.
  -- NULL for a run started outside herdr, which is normal and not an error.
  herdr_pane   TEXT
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

-- What a run produced, as opposed to how long it took. The trace records the
-- shape of a run; this records its findings.
--
-- The first kind is `report`: the closing summary /begin writes at Gate 3. That
-- text used to exist only as pixels in a herdr pane, so closing the pane after a
-- ship destroyed the most valuable thing the run made. Storing it is what makes
-- closing the pane safe.
--
-- Deliberately general from the outset, because the evidence record (tests
-- green, browse audit clean, screenshots) is the same table approached from the
-- other side and must not be designed twice: `kind` is open, `body` holds text
-- inline, `path` points at something on disk instead, and `status` carries the
-- machine-checkable verdict an unattended run has to be judged on.
CREATE TABLE IF NOT EXISTS run_artifacts (
  id          INTEGER PRIMARY KEY,
  run_uid     TEXT    NOT NULL REFERENCES runs(run_uid) ON DELETE CASCADE,
  kind        TEXT    NOT NULL,   -- report | tests | audit | screenshot
  -- How we came to have this. `run` = the run wrote it down itself, and is
  -- complete. `pane` = we scraped it off the terminal before closing it, and is
  -- one viewport of whatever had not scrolled away. The board shows the
  -- difference rather than presenting a photograph as a record.
  source      TEXT    NOT NULL DEFAULT 'run',   -- run | pane
  status      TEXT,                             -- ok | fail | NULL
  body        TEXT,
  path        TEXT,
  created_at  TEXT    NOT NULL
);

-- One report per run, so re-running the writer replaces rather than stacks.
-- PARTIAL on purpose: a run may accumulate many screenshots or test rows, and a
-- blanket UNIQUE(run_uid, kind) would forbid exactly what this table is meant
-- to grow into.
CREATE UNIQUE INDEX IF NOT EXISTS run_artifacts_one_report
  ON run_artifacts (run_uid) WHERE kind = 'report';

CREATE INDEX IF NOT EXISTS run_artifacts_by_run ON run_artifacts (run_uid, id);

-- A project's handle is unique within its app — two apps may both have a
-- "cleanup" project. coalesce() rather than the bare column because SQLite
-- treats NULLs as distinct, which would let repo-less ideas collide freely.
CREATE UNIQUE INDEX IF NOT EXISTS projects_slug
  ON projects (coalesce(repo_slug, ''), slug);
CREATE INDEX IF NOT EXISTS projects_by_repo ON projects (repo_slug, status);

-- A live branch belongs to at most one ticket. Partial, because the many
-- not-yet-started tickets all have NULL branch and must not collide.
CREATE UNIQUE INDEX IF NOT EXISTS tickets_active_branch
  ON tickets (repo_slug, branch) WHERE branch IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS tickets_worktree
  ON tickets (worktree_path) WHERE worktree_path IS NOT NULL;

CREATE INDEX IF NOT EXISTS tickets_by_repo ON tickets (repo_slug, status);
CREATE INDEX IF NOT EXISTS tickets_by_project ON tickets (project_id);
-- The PRIMARY KEY already indexes (blocker_id, …), which answers "what does this
-- ticket block?". The other direction — "what blocks this one?" — is the HOT
-- query, asked on every `ticket start` and once per card the board draws, and
-- without its own index it is a table scan.
CREATE INDEX IF NOT EXISTS ticket_deps_by_blocked ON ticket_deps (blocked_id);

CREATE INDEX IF NOT EXISTS documents_by_ticket ON documents (ticket_id);
CREATE INDEX IF NOT EXISTS documents_by_project ON documents (project_id);
CREATE INDEX IF NOT EXISTS events_by_run ON events (run_uid, id);
CREATE INDEX IF NOT EXISTS runs_by_status ON runs (status, id DESC);
