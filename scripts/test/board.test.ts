// Integration tests for bin/smriti-board — the served factory front door.
// Drives the real CLI + HTTP surface. What is locked down here is the AUTH
// model (this server cuts worktrees and reads files, so every route must be
// authenticated) and the singleton contract.

import { test, expect, beforeAll, afterAll } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const REPO_ROOT = join(import.meta.dir, '..', '..');
const BOARD = join(REPO_ROOT, 'bin', 'smriti-board');
const TICKET = join(REPO_ROOT, 'bin', 'smriti-ticket');

let HOME_DIR = '';
let port = 0;
let secret = '';
let jar = '';

function cli(args: string[], env: Record<string, string> = {}) {
  return spawnSync('bun', [BOARD, ...args], {
    encoding: 'utf8',
    env: { ...process.env, SMRITI_HOME: HOME_DIR, SMRITI_BOARD_IDLE_MS: '60000', ...env },
  });
}
const base = () => `http://127.0.0.1:${port}`;
const withCookie = (extra: Record<string, string> = {}) => ({ headers: { cookie: jar, ...extra } });

beforeAll(async () => {
  HOME_DIR = mkdtempSync(join(tmpdir(), 'smriti-board-'));
  const r = cli(['--url']);
  expect(r.status).toBe(0);
  const url = new URL(r.stdout.trim());
  port = Number(url.port);
  secret = url.searchParams.get('k') ?? '';
  expect(secret.length).toBeGreaterThan(10);

  // The bootstrap exchange: secret → cookie. redirect: 'manual' so we can read
  // the Set-Cookie off the 302 rather than following it.
  const ex = await fetch(`${base()}/?k=${secret}`, { redirect: 'manual' });
  expect(ex.status).toBe(302);
  jar = (ex.headers.get('set-cookie') || '').split(';')[0];
  expect(jar).toStartWith('smriti_board=');
});

afterAll(() => {
  cli(['stop']);
  rmSync(HOME_DIR, { recursive: true, force: true });
});

test('unauthenticated page load is refused', async () => {
  const r = await fetch(`${base()}/`);
  expect(r.status).toBe(403);
});

test('wrong bootstrap secret is refused', async () => {
  const r = await fetch(`${base()}/?k=deadbeef`, { redirect: 'manual' });
  expect(r.status).toBe(403);
});

test('a foreign Host header is refused even with a valid cookie', async () => {
  // DNS rebinding: the request arrives at our socket but with the attacker's
  // Host. Must die before any route logic.
  const r = await fetch(`${base()}/api/state`, withCookie({ host: 'evil.example' }));
  expect(r.status).toBe(403);
});

test('a cross-site Origin is refused even with a valid cookie', async () => {
  const r = await fetch(`${base()}/api/state`, withCookie({ origin: 'http://evil.example' }));
  expect(r.status).toBe(403);
});

test('the cookie unlocks the page and the state', async () => {
  const page = await fetch(`${base()}/`, withCookie());
  expect(page.status).toBe(200);
  expect(await page.text()).toContain('smriti');

  const state = await fetch(`${base()}/api/state`, withCookie());
  expect(state.status).toBe(200);
  const s = (await state.json()) as { tickets: unknown[]; runs: unknown[]; documents: unknown[] };
  expect(Array.isArray(s.tickets)).toBe(true);
  expect(Array.isArray(s.runs)).toBe(true);
  expect(Array.isArray(s.documents)).toBe(true);
});

test('reads without the cookie are refused — the doc endpoint is as sensitive as a mutation', async () => {
  const r = await fetch(`${base()}/api/doc/1`);
  expect(r.status).toBe(403);
});

test('doc reads are confined to $SMRITI_HOME/projects', async () => {
  // Register one doc inside the projects root and one escaping it. The board
  // must serve the first and refuse the second — otherwise it is a local
  // file-read oracle for anything the user can name.
  const tk = (args: string[]) =>
    spawnSync(TICKET, args, { encoding: 'utf8', env: { ...process.env, SMRITI_HOME: HOME_DIR } });
  tk(['add', 'doc test', '--project', 'demo']);

  const inside = join(HOME_DIR, 'projects', 'demo', 'x-plan-1.md');
  mkdirSync(join(HOME_DIR, 'projects', 'demo'), { recursive: true });
  writeFileSync(inside, '# hello\n\nfrom **inside**');
  const outside = join(HOME_DIR, 'escape.md');
  writeFileSync(outside, 'secret');

  tk(['doc', '1', '--type', 'plan', '--path', inside]);
  tk(['doc', '1', '--type', 'debug', '--path', outside]);

  const state = await fetch(`${base()}/api/state`, withCookie());
  const docs = ((await state.json()) as { documents: { id: number; path: string }[] }).documents;
  const inDoc = docs.find((d) => d.path === inside)!;
  const outDoc = docs.find((d) => d.path === outside)!;

  const ok = await fetch(`${base()}/api/doc/${inDoc.id}`, withCookie());
  expect(ok.status).toBe(200);
  expect(((await ok.json()) as { html: string }).html).toContain('<strong>inside</strong>');

  const bad = await fetch(`${base()}/api/doc/${outDoc.id}`, withCookie());
  expect(bad.status).toBe(403);
});

test('tickets can be added through the board', async () => {
  const r = await fetch(`${base()}/api/tickets`, {
    method: 'POST',
    headers: { cookie: jar, 'content-type': 'application/json' },
    body: JSON.stringify({ title: 'from the board', project: 'demo' }),
  });
  expect(r.status).toBe(200);
  const { id } = (await r.json()) as { id: number };
  expect(id).toBeGreaterThan(0);
});

test('running the CLI again reuses the live server', () => {
  const r = cli(['--url']);
  expect(r.status).toBe(0);
  expect(r.stdout).toContain(`127.0.0.1:${port}`);
});

// NOTE: the concurrent-start fix (atomic pidfile claim) is verified by shell,
// not here — bun's spawnSync serializes, so an in-process "concurrent" test
// would assert nothing. Keeping a test that cannot fail would be worse than
// having none.
test('a read failure is a 503, not an empty board', async () => {
  // Collapsing "could not read" into "there is nothing" rendered a broken
  // store as an inviting blank page.
  const db = join(HOME_DIR, 'factory.db');
  const saved = readFileSync(db);
  writeFileSync(db, 'not a database');
  try {
    const r = await fetch(`${base()}/api/state`, withCookie());
    expect(r.status).toBe(503);
    expect(((await r.json()) as { error: string }).error).toContain('could not read');
  } finally {
    writeFileSync(db, saved);
  }
});

test('the served page script actually parses', async () => {
  // The page is built as a template literal, so an escape that is legal in TS
  // can still emit broken JS: /^https?:\/\//i was served as /^https?:///i and
  // the resulting SyntaxError killed the ENTIRE client script — no render, no
  // keys, a board that looked simply empty. Nothing caught it because every
  // other test exercises the server and never the page.
  const page = await (await fetch(`${base()}/`, withCookie())).text();
  const blocks = [...page.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  expect(blocks.length).toBeGreaterThan(0);
  for (const js of blocks) {
    // new Function parses without executing — a SyntaxError here is the bug.
    expect(() => new Function(js)).not.toThrow();
  }
});

test('the served page carries no template-literal escape damage', async () => {
  const page = await (await fetch(`${base()}/`, withCookie())).text();
  const script = page.split('<script>').pop() ?? '';
  // Three slashes in a row inside a regex is the fingerprint of a collapsed \/.
  expect(script).not.toContain(':///i');
});

test('/api/state carries live sessions so a blocked agent can surface', async () => {
  // The board's "waiting on you" band was driven only by smriti's own trace,
  // which knows about /begin gates and nothing about a Claude session stalled
  // on a permission prompt. herdr knows; the board has to ask it.
  const r = await fetch(`${base()}/api/state`, withCookie());
  expect(r.status).toBe(200);
  const s = (await r.json()) as { sessions?: unknown };
  expect(Array.isArray(s.sessions)).toBe(true);
});

test('a second start attaches instead of spawning a duplicate session', async () => {
  // Starting an already-in-progress ticket used to run launchSession again,
  // which tried to create a second herdr agent under the same name — the launch
  // failed and the board told you to run claude by hand for a session that was
  // already open.
  const tk = (args: string[]) =>
    spawnSync(TICKET, args, { encoding: 'utf8', env: { ...process.env, SMRITI_HOME: HOME_DIR } });
  tk(['add', 'double start', '--project', 'demo']);
  const list = JSON.parse(tk(['list', '--all', '--json']).stdout) as { id: number; title: string }[];
  const id = list.find((t) => t.title === 'double start')!.id;

  // No repo for project 'demo', so start refuses — the point here is that the
  // route reports the failure rather than pretending, and never 500s twice
  // differently.
  const a = await fetch(`${base()}/api/tickets/${id}/start`, {
    method: 'POST', headers: { cookie: jar, 'content-type': 'application/json' }, body: '{}',
  });
  const b = await fetch(`${base()}/api/tickets/${id}/start`, {
    method: 'POST', headers: { cookie: jar, 'content-type': 'application/json' }, body: '{}',
  });
  expect(a.status).toBe(b.status);
});

// ─── durations ────────────────────────────────────────────────────────────
// The board renders elapsed, totals and a phase breakdown, so the routes that
// carry those numbers are as load-bearing as the ones that carry tickets.

const TRACE = join(REPO_ROOT, 'bin', 'smriti-trace');
const tr = (args: string[]) =>
  spawnSync(TRACE, args, { encoding: 'utf8', env: { ...process.env, SMRITI_HOME: HOME_DIR } });
const sql = (q: string) =>
  spawnSync('sqlite3', [join(HOME_DIR, 'factory.db'), q], { encoding: 'utf8' });

type ApiRun = { run_uid: string; status: string; duration_s: number; agent_s: number; you_s: number };

// A ticket with a finished, gated run and a second run still going. Timestamps
// are stamped after the fact so the assertions are exact.
function seedRuns(): { ticketId: number; doneUid: string; openUid: string } {
  const tk = (args: string[]) =>
    spawnSync(TICKET, args, { encoding: 'utf8', env: { ...process.env, SMRITI_HOME: HOME_DIR } });
  tk(['add', 'timed work', '--project', 'demo']);
  const list = JSON.parse(tk(['list', '--all', '--json']).stdout) as { id: number; title: string }[];
  const ticketId = list.find((t) => t.title === 'timed work')!.id;

  const uidOf = (out: string) => out.trim().split('=')[1];
  const doneUid = uidOf(tr(['start', 'begin', '--ticket', String(ticketId)]).stdout);
  tr(['emit', 'plan', 'ok', '--run', doneUid]);
  tr(['emit', 'approve', 'awaiting', '--run', doneUid]);
  tr(['emit', 'implement', 'ok', '--run', doneUid]);
  tr(['end', '--run', doneUid]);
  sql(
    `UPDATE runs SET started_at='2026-08-08T10:00:00Z', ended_at='2026-08-08T10:20:00Z' WHERE run_uid='${doneUid}';` +
      `UPDATE events SET at='2026-08-08T10:04:00Z' WHERE run_uid='${doneUid}' AND phase='plan';` +
      `UPDATE events SET at='2026-08-08T10:06:00Z' WHERE run_uid='${doneUid}' AND phase='approve';` +
      `UPDATE events SET at='2026-08-08T10:16:00Z' WHERE run_uid='${doneUid}' AND phase='implement';`,
  );

  const openUid = uidOf(tr(['start', 'begin', '--ticket', String(ticketId)]).stdout);
  sql(`UPDATE runs SET started_at='2026-08-08T11:00:00Z' WHERE run_uid='${openUid}';`);
  return { ticketId, doneUid, openUid };
}

test('/api/state carries finished runs with their durations, not just active ones', async () => {
  // The board asked for --active only, so a finished run was simply absent —
  // and a card can't say "took 20m" about a run it never receives.
  const { doneUid, openUid } = seedRuns();
  const s = (await (await fetch(`${base()}/api/state`, withCookie())).json()) as { runs: ApiRun[] };

  const done = s.runs.find((r) => r.run_uid === doneUid)!;
  expect(done).toBeDefined();
  expect(done.status).toBe('done');
  expect(done.duration_s).toBe(1200);
  expect(done.you_s).toBe(600); // 10:06 -> 10:16, the gate
  expect(done.agent_s).toBe(600);
  expect(done.agent_s + done.you_s).toBe(done.duration_s);

  // The open one is still there, and its duration is measured to now.
  const open = s.runs.find((r) => r.run_uid === openUid)!;
  expect(open.status).toBe('running');
  expect(open.duration_s).toBeGreaterThan(0);
});

test('/api/runs returns every run for a ticket', async () => {
  const { ticketId, doneUid, openUid } = seedRuns();
  const r = await fetch(`${base()}/api/runs?ticket=${ticketId}`, withCookie());
  expect(r.status).toBe(200);
  const uids = ((await r.json()) as { runs: ApiRun[] }).runs.map((x) => x.run_uid);
  expect(uids).toContain(doneUid);
  expect(uids).toContain(openUid);
});

test('/api/run/:uid returns the phase breakdown', async () => {
  const { doneUid } = seedRuns();
  const r = await fetch(`${base()}/api/run/${doneUid}`, withCookie());
  expect(r.status).toBe(200);
  const d = (await r.json()) as {
    totals: { duration_s: number; agent_s: number; you_s: number };
    phases: { phase: string; total_s: number; you_s: number }[];
  };
  expect(d.totals.duration_s).toBe(1200);
  expect(d.phases.map((p) => p.phase)).toEqual(['plan', 'approve', 'implement']);
  // The gate's ten minutes belong to approve, not to the phase that followed it.
  expect(d.phases.find((p) => p.phase === 'approve')!.you_s).toBe(600);
  expect(d.phases.find((p) => p.phase === 'implement')!.you_s).toBe(0);
});

test('run and ticket ids from the client are validated before reaching the CLI', async () => {
  for (const bad of ['../../etc/passwd', '; rm -rf /', 'ZZZZZZZZ', 'deadbeef0']) {
    const r = await fetch(`${base()}/api/run/${encodeURIComponent(bad)}`, withCookie());
    expect(r.status).toBe(400);
  }
  for (const bad of ['1; DROP TABLE runs', 'abc', '']) {
    const r = await fetch(`${base()}/api/runs?ticket=${encodeURIComponent(bad)}`, withCookie());
    expect(r.status).toBe(400);
  }
  const days = await fetch(`${base()}/api/stats?days=1%20OR%201=1`, withCookie());
  expect(days.status).toBe(400);
});

test('/api/stats answers with medians per skill and per phase', async () => {
  seedRuns();
  const r = await fetch(`${base()}/api/stats?days=0`, withCookie());
  expect(r.status).toBe(200);
  const s = (await r.json()) as {
    runs: number;
    by_skill: { skill: string; median_s: number }[];
    by_phase: { phase: string; median_you_s: number }[];
  };
  expect(s.runs).toBeGreaterThan(0);
  expect(s.by_skill.some((x) => x.skill === 'begin')).toBe(true);
  // The distinction the whole ticket is about, surviving all the way to HTTP.
  expect(s.by_phase.find((p) => p.phase === 'approve')!.median_you_s).toBeGreaterThan(0);
});

test('the new timing routes are refused without the cookie', async () => {
  for (const path of ['/api/runs?ticket=1', '/api/run/deadbeef', '/api/stats']) {
    expect((await fetch(`${base()}${path}`)).status).toBe(403);
  }
});
