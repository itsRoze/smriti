// Integration tests for bin/smriti-board — the served factory front door.
// Drives the real CLI + HTTP surface. What is locked down here is the AUTH
// model (this server cuts worktrees and reads files, so every route must be
// authenticated) and the singleton contract.

import { test, expect, beforeAll, afterAll } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const REPO_ROOT = join(import.meta.dir, '..', '..');
const BOARD = join(REPO_ROOT, 'bin', 'smriti-board');
const TICKET = join(REPO_ROOT, 'bin', 'smriti-ticket');
const PROJECT = join(REPO_ROOT, 'bin', 'smriti-project');
const REPO = join(REPO_ROOT, 'bin', 'smriti-repo');
const SLUG = join(REPO_ROOT, 'bin', 'smriti-slug');

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

test('a document is served out of the store, and outlives its file', async () => {
  // This route used to open a file whose path came from a client-supplied id,
  // guarded by realpath-confinement to $SMRITI_HOME/projects. The factory
  // stores document bodies now, so the read goes through the CLI and the
  // server touches no path at all — the confinement is gone because the file
  // access it guarded is gone. Nothing here can construct a document row
  // either: the board has no route that writes one, so the only paths ever
  // read are ones the local user registered themselves.
  const tk = (args: string[]) =>
    spawnSync(TICKET, args, { encoding: 'utf8', env: { ...process.env, SMRITI_HOME: HOME_DIR } });
  tk(['add', 'doc test', '--repo', 'demo']);

  const inside = join(HOME_DIR, 'projects', 'demo', 'x-plan-1.md');
  mkdirSync(join(HOME_DIR, 'projects', 'demo'), { recursive: true });
  writeFileSync(inside, '# hello\n\nfrom **inside**');
  tk(['doc', '1', '--type', 'plan', '--path', inside]);

  const state = await fetch(`${base()}/api/state`, withCookie());
  const docs = ((await state.json()) as { documents: { id: number; path: string }[] }).documents;
  const doc = docs.find((d) => d.path === inside)!;

  const ok = await fetch(`${base()}/api/doc/${doc.id}`, withCookie());
  expect(ok.status).toBe(200);
  expect(((await ok.json()) as { html: string }).html).toContain('<strong>inside</strong>');

  // The point of the whole change: delete the working copy and it still reads.
  rmSync(inside);
  const stillThere = await fetch(`${base()}/api/doc/${doc.id}`, withCookie());
  expect(stillThere.status).toBe(200);
  expect(((await stillThere.json()) as { html: string }).html).toContain('<strong>inside</strong>');
});

test('a path outside the store is never served, and never read', async () => {
  // The confinement this route used to enforce with realpath still exists — it
  // moved into capture_doc, where the read now happens. So a row naming a file
  // outside $SMRITI_HOME/projects has no body, and asking for it gets the
  // no-content answer rather than the file's contents.
  const tk = (args: string[]) =>
    spawnSync(TICKET, args, { encoding: 'utf8', env: { ...process.env, SMRITI_HOME: HOME_DIR } });
  const outside = join(HOME_DIR, 'escape.md');
  writeFileSync(outside, 'a secret');
  tk(['doc', '-', '--type', 'debug', '--path', outside]);

  const state = await fetch(`${base()}/api/state`, withCookie());
  const docs = ((await state.json()) as { documents: { id: number; path: string }[] }).documents;
  const doc = docs.find((d) => d.path === outside)!;

  const r = await fetch(`${base()}/api/doc/${doc.id}`, withCookie());
  expect(r.status).toBe(404);
  expect(await r.text()).not.toContain('a secret');
});

test('a document registered but never written says so, rather than reading anything', async () => {
  const tk = (args: string[]) =>
    spawnSync(TICKET, args, { encoding: 'utf8', env: { ...process.env, SMRITI_HOME: HOME_DIR } });
  const never = join(HOME_DIR, 'projects', 'demo', 'never-plan-1.md');
  tk(['doc', '-', '--type', 'plan', '--path', never]);

  const state = await fetch(`${base()}/api/state`, withCookie());
  const docs = ((await state.json()) as { documents: { id: number; path: string; has_body: number }[] })
    .documents;
  const doc = docs.find((d) => d.path === never)!;
  // The index carries the state, so the client can label it without fetching.
  expect(doc.has_body).toBe(0);

  const r = await fetch(`${base()}/api/doc/${doc.id}`, withCookie());
  expect(r.status).toBe(404);
  expect(((await r.json()) as { error: string }).error).toContain('no content stored');
});

// ── /api/render ────────────────────────────────────────────────────────────
// The seam that lets descriptions render at all: lib/md.ts is a Bun module and
// the browser client is one template string with no build step, so the
// renderer is reachable only over the wire.

const render = (body: unknown, headers: Record<string, string> = {}) =>
  fetch(`${base()}/api/render`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: jar, ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

test('render turns markdown into real markup', async () => {
  const r = await render({ md: '# title\n\n- one\n- two\n\n| a | b |\n|---|---|\n| 1 | 2 |' });
  expect(r.status).toBe(200);
  const { html } = (await r.json()) as { html: string };
  expect(html).toContain('<h1>title</h1>');
  expect(html).toContain('<li>one</li>');
  expect(html).toContain('<div class="tablewrap">');
  expect(html).toContain('<th>a</th>');
});

test('render is refused without the cookie', async () => {
  const r = await fetch(`${base()}/api/render`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ md: '# nope' }),
  });
  expect(r.status).toBe(403);
});

test('render refuses an oversized body on its declared length', async () => {
  // fetch sets content-length itself, so this is the cheap early refusal.
  const r = await render({ md: 'x'.repeat(250_000) });
  expect(r.status).toBe(413);
});

test('render refuses an oversized body that declared no length at all', async () => {
  // A streamed body is sent chunked, so there is no content-length to check.
  // The budget has to be enforced while reading — and it must still be enforced
  // AFTER the refusal, i.e. the connection has to stay usable, which is what
  // the follow-up request below proves.
  const payload = new TextEncoder().encode(JSON.stringify({ md: 'x'.repeat(250_000) }));
  const stream = new ReadableStream({ start(c) { c.enqueue(payload); c.close(); } });
  const r = await fetch(`${base()}/api/render`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: jar },
    body: stream,
    duplex: 'half',
  } as RequestInit & { duplex: string });
  expect(r.status).toBe(413);

  const after = await render({ md: '# still here' });
  expect(after.status).toBe(200);
  expect(((await after.json()) as { html: string }).html).toContain('<h1>still here</h1>');
});

test('render counts the cap in bytes, not characters', async () => {
  // 60k four-byte emoji is 240 kB but only 60k characters (120k UTF-16 units).
  // A character budget would wave this straight through the 200 kB limit.
  const r = await render({ md: '😀'.repeat(60_000) });
  expect(r.status).toBe(413);
});

test('a hostile description renders inert', async () => {
  // Descriptions are the first USER-EDITED content to go through innerHTML, so
  // the renderer's escape-first guarantee is pinned here rather than asserted
  // in a comment. Two separate claims: the markup never becomes elements, and
  // no live href survives the scheme allowlist.
  const md = [
    '<script>window.pwned = 1</script>',
    '',
    '<img src=x onerror="window.pwned=1">',
    '',
    '[click me](javascript:window.pwned=1)',
    '',
    '[fine](https://example.com)',
  ].join('\n');
  const { html } = (await (await render({ md })).json()) as { html: string };

  // No element is ever created — the angle brackets arrive escaped, so the
  // markup lands as text. (`onerror=` DOES appear, inside &lt;img …&gt;, and
  // that is fine: it is characters in a paragraph, not an attribute.)
  expect(html).not.toContain('<script');
  expect(html).not.toContain('<img');
  expect(html).toContain('&lt;script&gt;');
  expect(html).toContain('&lt;img src=x onerror=');
  // And no live href survives the scheme allowlist, while a real one does.
  expect(html).not.toContain('javascript:');
  expect(html).toContain('click me');
  expect(html).toContain('<a href="https://example.com"');
});

test('tickets can be added through the board', async () => {
  const r = await fetch(`${base()}/api/tickets`, {
    method: 'POST',
    headers: { cookie: jar, 'content-type': 'application/json' },
    body: JSON.stringify({ title: 'from the board', repo: 'demo' }),
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

test('board-ui.ts stays one template literal, comments included', () => {
  // Both halves of this have now shipped as real bugs, and neither is visible
  // when reading the source — the source looks completely ordinary.
  //
  //   A backtick anywhere ENDS the literal. One in a CSS comment turned the
  //   rest of the stylesheet into TypeScript and the page stopped building.
  //
  //   A backslash escape is consumed by the literal even inside a COMMENT. A
  //   \n written in a `//` line became a real newline, ended the comment there
  //   and spilled its remaining words into the page as code, which the browser
  //   met as `ReferenceError: here is not defined`. It parses; it just breaks.
  //
  // Written as a source check rather than a page check because a comment leaves
  // no trace in the output to assert against.
  const src = readFileSync(join(REPO_ROOT, 'lib', 'board-ui.ts'), 'utf8');
  const lines = src.split('\n');
  const ticks = lines.flatMap((l, i) => (l.includes('`') ? [i + 1] : []));
  // Exactly two: the line that opens the literal and the line that closes it.
  expect(ticks.length).toBe(2);

  const open = ticks[0]!;
  const close = ticks[1]!;
  const offenders = lines
    .slice(open, close - 1)
    .map((l, i) => ({ line: open + i + 1, text: l }))
    .filter(({ text }) => {
      const t = text.trim();
      if (!(t.startsWith('//') || t.startsWith('*') || t.startsWith('/*'))) return false;
      // A doubled backslash is already escaped and survives; a lone one does not.
      return /(^|[^\\])\\[a-z]/.test(t);
    });
  expect(offenders).toEqual([]);
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
  tk(['add', 'double start', '--repo', 'demo']);
  const list = JSON.parse(tk(['list', '--all', '--json']).stdout) as { id: number; title: string }[];
  const id = list.find((t) => t.title === 'double start')!.id;

  // No repo for app 'demo', so start refuses — the point here is that the
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
// are stamped after the fact so the assertions are exact — except the open
// run's start, which is stamped RELATIVE to now: pinning it to a fixed instant
// made the result depend on the wall-clock hour the suite happened to run at.
let seedN = 0;
function seedRuns(): { ticketId: number; doneUid: string; openUid: string } {
  const tk = (args: string[]) =>
    spawnSync(TICKET, args, { encoding: 'utf8', env: { ...process.env, SMRITI_HOME: HOME_DIR } });
  // A distinct title per call: every test shares one HOME_DIR, so resolving by
  // a constant title attached every seed's runs to the first test's ticket.
  const title = `timed work ${++seedN}`;
  tk(['add', title, '--repo', 'demo']);
  const list = JSON.parse(tk(['list', '--all', '--json']).stdout) as { id: number; title: string }[];
  const ticketId = list.find((t) => t.title === title)!.id;

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
  sql(
    `UPDATE runs SET started_at = strftime('%Y-%m-%dT%H:%M:%SZ','now','-5 minutes') WHERE run_uid='${openUid}';`,
  );
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

test('a gated run always reaches the board, however old it is', async () => {
  // /api/state used to ask for the N most recent runs and nothing else, so a
  // run parked at a gate that had since fallen out of that window vanished —
  // the board rendered "nothing needs you" while a gate was actually blocking.
  // The window is a nicety; never losing a gate is the contract.
  const { ticketId } = seedRuns();
  const uidOf = (out: string) => out.trim().split('=')[1];
  const gated = uidOf(tr(['start', 'begin', '--ticket', String(ticketId)]).stdout);
  tr(['emit', 'approve', 'awaiting', '--run', gated]);
  // Bury it: make it the OLDEST run, then push it past any plausible window.
  sql(
    `UPDATE runs SET id = -1, started_at='2020-01-01T00:00:00Z' WHERE run_uid='${gated}';` +
      `UPDATE events SET at='2020-01-01T00:05:00Z' WHERE run_uid='${gated}';`,
  );

  const s = (await (await fetch(`${base()}/api/state`, withCookie())).json()) as {
    runs: (ApiRun & { last_phase: string; last_event_at: string })[];
  };
  const found = s.runs.find((r) => r.run_uid === gated);
  expect(found).toBeDefined();
  expect(found!.status).toBe('awaiting');
  // And it carries what the waiting band renders.
  expect(found!.last_phase).toBe('approve');
  expect(found!.last_event_at).toBe('2020-01-01T00:05:00Z');

  // No duplicates from merging the two reads.
  expect(s.runs.filter((r) => r.run_uid === gated)).toHaveLength(1);
});

test('/api/stats rejects a days value too large to be an integer', async () => {
  // Digits alone passed the guard, and the CLI then failed its `[ -gt ]` test
  // without tripping set -e — answering over all time under a bogus label.
  const r = await fetch(`${base()}/api/stats?days=99999999999999999999`, withCookie());
  expect(r.status).toBe(400);
});

// ─── apps, projects, and the repo-level markdown route ────────────────────
// The ONLY file-read exception left on this server — /api/doc/:id was the
// other one, and it reads the factory now. This one survives because the
// filename is never user input, so these lock down that the narrowing holds.

const proj = (args: string[]) =>
  spawnSync(PROJECT, args, { encoding: 'utf8', env: { ...process.env, SMRITI_HOME: HOME_DIR } });
const repoCli = (args: string[]) =>
  spawnSync(REPO, args, { encoding: 'utf8', env: { ...process.env, SMRITI_HOME: HOME_DIR } });

test('state carries apps and projects alongside tickets', async () => {
  proj(['add', 'Search v2', '--repo', 'demo']);
  const s = (await (await fetch(`${base()}/api/state`, withCookie())).json()) as {
    repositories: { slug: string }[];
    projects: { id: number; name: string; repo_slug: string }[];
  };
  expect(Array.isArray(s.repositories)).toBe(true);
  expect(s.projects.some((p) => p.name === 'Search v2' && p.repo_slug === 'demo')).toBe(true);
  // Derived existence: 'demo' has tickets but no repositories row, and must
  // still appear as an app.
  expect(s.repositories.some((r) => r.slug === 'demo')).toBe(true);
});

test('an app description round-trips through PATCH', async () => {
  const r = await fetch(`${base()}/api/repos/demo`, {
    method: 'PATCH',
    headers: { cookie: jar, 'content-type': 'application/json' },
    body: JSON.stringify({ description: 'the scratch app' }),
  });
  expect(r.status).toBe(200);
  const s = (await (await fetch(`${base()}/api/state`, withCookie())).json()) as {
    repositories: { slug: string; description: string | null }[];
  };
  expect(s.repositories.find((x) => x.slug === 'demo')?.description).toBe('the scratch app');
});

test('a project can be created and described through the board', async () => {
  const c = await fetch(`${base()}/api/projects`, {
    method: 'POST',
    headers: { cookie: jar, 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Ranking', repo: 'demo' }),
  });
  expect(c.status).toBe(200);
  const { id } = (await c.json()) as { id: number };
  expect(id).toBeGreaterThan(0);

  const p = await fetch(`${base()}/api/projects/${id}`, {
    method: 'PATCH',
    headers: { cookie: jar, 'content-type': 'application/json' },
    body: JSON.stringify({ description: 'make it rank' }),
  });
  expect(p.status).toBe(200);
  const s = (await (await fetch(`${base()}/api/state`, withCookie())).json()) as {
    projects: { id: number; description: string | null }[];
  };
  expect(s.projects.find((x) => x.id === id)?.description).toBe('make it rank');
});

// Status has its own route rather than a field on PATCH: `edit` and `status`
// are separate CLI verbs, so a PATCH carrying both would have to run two of
// them in sequence with nothing transactional around the pair.
test('any status can be set through the board, cancelled included', async () => {
  const tk = (args: string[]) =>
    spawnSync(TICKET, args, { encoding: 'utf8', env: { ...process.env, SMRITI_HOME: HOME_DIR } });
  tk(['add', 'status me', '--repo', 'demo']);
  const all = JSON.parse(tk(['list', '--all', '--json']).stdout) as { id: number; title: string }[];
  const id = all.find((t) => t.title === 'status me')!.id;

  const set = (status: string) =>
    fetch(`${base()}/api/tickets/${id}/status`, {
      method: 'POST',
      headers: { cookie: jar, 'content-type': 'application/json' },
      body: JSON.stringify({ status }),
    });
  const statusOf = () =>
    (JSON.parse(tk(['list', '--all', '--json']).stdout) as { id: number; status: string }[])
      .find((t) => t.id === id)!.status;

  for (const s of ['idea', 'ready', 'in_progress', 'in_review', 'shipped', 'cancelled']) {
    expect((await set(s)).status).toBe(200);
    expect(statusOf()).toBe(s);
  }

  // The CLI owns which values are legal; the route does not keep its own list
  // that could drift out of step with validate_status.
  const bad = await set('archived');
  expect(bad.status).toBe(500);
  expect(((await bad.json()) as { error: string }).error).toContain('invalid status');
  expect(statusOf()).toBe('cancelled');

  const empty = await set('');
  expect(empty.status).toBe(400);
});

// Ticket #11. The route says WHERE relative to another card and never a raw
// position — the CLI owns that arithmetic, so the drag and the keyboard both
// reach one place that can decide about midpoints and repacking.
test('tickets reorder through the board, and an illegal drop is a 409', async () => {
  const tk = (args: string[]) =>
    spawnSync(TICKET, args, { encoding: 'utf8', env: { ...process.env, SMRITI_HOME: HOME_DIR } });
  for (const t of ['ord one', 'ord two', 'ord three']) tk(['add', t, '--repo', 'ordering']);
  tk(['add', 'somewhere else', '--repo', 'elsewhere']);

  const list = () =>
    (JSON.parse(tk(['list', '--all', '--json']).stdout) as { id: number; title: string; repo_slug: string | null }[]);
  const byTitle = (t: string) => list().find((x) => x.title === t)!.id;
  const orderIn = (repo: string) => list().filter((x) => x.repo_slug === repo).map((x) => x.title);

  const one = byTitle('ord one'), two = byTitle('ord two'), three = byTitle('ord three');
  const move = (id: number, body: unknown) =>
    fetch(`${base()}/api/tickets/${id}/move`, {
      method: 'POST',
      headers: { cookie: jar, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });

  // list --json is itself ordered by position, so reading it back IS the check.
  expect(orderIn('ordering')).toEqual(['ord one', 'ord two', 'ord three']);

  expect((await move(three, { before: one })).status).toBe(200);
  expect(orderIn('ordering')).toEqual(['ord three', 'ord one', 'ord two']);

  expect((await move(three, { after: two })).status).toBe(200);
  expect(orderIn('ordering')).toEqual(['ord one', 'ord two', 'ord three']);

  expect((await move(two, { top: true })).status).toBe(200);
  expect(orderIn('ordering')).toEqual(['ord two', 'ord one', 'ord three']);

  expect((await move(two, { bottom: true })).status).toBe(200);
  expect(orderIn('ordering')).toEqual(['ord one', 'ord three', 'ord two']);

  // Naming a card in another app is the user dropping somewhere they cannot,
  // not the factory falling over — 409 so the page can tell the two apart.
  const illegal = await move(one, { after: byTitle('somewhere else') });
  expect(illegal.status).toBe(409);
  expect(((await illegal.json()) as { error: string }).error).toContain('different app or project');
  expect(orderIn('ordering')).toEqual(['ord one', 'ord three', 'ord two']);

  // No direction at all is the caller's mistake, and never a write.
  expect((await move(one, {})).status).toBe(400);

  // A 500 says "the factory fell over", so everything that is actually the
  // caller's mistake has to be something else. typeof 'number' alone would let
  // all three of these reach the command line and come back as a 500.
  for (const bad of [NaN, 1.5, Infinity, 0, -3, '7']) {
    expect((await move(one, { after: bad })).status).toBe(400);
  }
  // A well-formed id for a ticket that is not there is a 404, not a 500.
  expect((await move(one, { after: 999999 })).status).toBe(404);
  expect(orderIn('ordering')).toEqual(['ord one', 'ord three', 'ord two']);
});

test('a ticket can be re-filed into a project and back out again', async () => {
  const tk = (args: string[]) =>
    spawnSync(TICKET, args, { encoding: 'utf8', env: { ...process.env, SMRITI_HOME: HOME_DIR } });
  tk(['add', 're-file me', '--repo', 'demo']);
  const all = JSON.parse(tk(['list', '--all', '--json']).stdout) as { id: number; title: string }[];
  const id = all.find((t) => t.title === 're-file me')!.id;

  const st = (await (await fetch(`${base()}/api/state`, withCookie())).json()) as {
    projects: { id: number; name: string }[];
  };
  const pid = st.projects.find((p) => p.name === 'Search v2')!.id;

  const into = await fetch(`${base()}/api/tickets/${id}`, {
    method: 'PATCH',
    headers: { cookie: jar, 'content-type': 'application/json' },
    body: JSON.stringify({ project: String(pid) }),
  });
  expect(into.status).toBe(200);
  let s = (await (await fetch(`${base()}/api/state`, withCookie())).json()) as {
    tickets: { id: number; project_id: number | null }[];
  };
  expect(s.tickets.find((t) => t.id === id)?.project_id).toBe(pid);

  // null is a real choice — "take it out" — not "leave it alone".
  const out = await fetch(`${base()}/api/tickets/${id}`, {
    method: 'PATCH',
    headers: { cookie: jar, 'content-type': 'application/json' },
    body: JSON.stringify({ project: null }),
  });
  expect(out.status).toBe(200);
  s = (await (await fetch(`${base()}/api/state`, withCookie())).json()) as {
    tickets: { id: number; project_id: number | null }[];
  };
  expect(s.tickets.find((t) => t.id === id)?.project_id).toBeNull();
});

test('repo markdown renders for a real app, and only the two allowed names', async () => {
  // A real repo on disk, reachable the only way the board is allowed to find
  // one: through the slug-cache, via smriti-repo show --json.
  const repoDir = join(HOME_DIR, 'realrepo');
  mkdirSync(repoDir, { recursive: true });
  spawnSync('git', ['init', '-q', '-b', 'main'], { cwd: repoDir });
  spawnSync('git', ['remote', 'add', 'origin', 'https://github.com/test/realapp.git'], { cwd: repoDir });
  writeFileSync(join(repoDir, 'PROJECT.md'), '# Real\n\nthis is **real**');
  // Populate the slug-cache for this path.
  spawnSync(SLUG, ['--print'], { cwd: repoDir, env: { ...process.env, SMRITI_HOME: HOME_DIR }, encoding: 'utf8' });

  const ok = await fetch(`${base()}/api/repos/test-realapp/doc/PROJECT`, withCookie());
  expect(ok.status).toBe(200);
  const body = (await ok.json()) as { name: string; html: string };
  expect(body.name).toBe('PROJECT.md');
  expect(body.html).toContain('<strong>real</strong>');

  // Absent file, unknown name, and a lowercase name are all 404 — the allowlist
  // is exact, and the doc name never reaches the filesystem as typed.
  expect((await fetch(`${base()}/api/repos/test-realapp/doc/DESIGN`, withCookie())).status).toBe(404);
  expect((await fetch(`${base()}/api/repos/test-realapp/doc/SECRETS`, withCookie())).status).toBe(404);
  expect((await fetch(`${base()}/api/repos/test-realapp/doc/project`, withCookie())).status).toBe(404);
});

test('the repo doc route refuses traversal, unknown apps, and no cookie', async () => {
  // A slug cannot contain a separator, so it can never walk out of the tree.
  expect((await fetch(`${base()}/api/repos/..%2F..%2Fetc/doc/PROJECT`, withCookie())).status).toBe(400);
  expect((await fetch(`${base()}/api/repos/.../doc/PROJECT`, withCookie())).status).toBe(400);
  // An app with no repo on this machine cannot be read from.
  expect((await fetch(`${base()}/api/repos/demo/doc/PROJECT`, withCookie())).status).toBe(404);
  expect((await fetch(`${base()}/api/repos/nope-nope/doc/PROJECT`, withCookie())).status).toBe(404);
  // Same posture as every other route on this server.
  expect((await fetch(`${base()}/api/repos/test-realapp/doc/PROJECT`)).status).toBe(403);
});

test('a DESIGN.md symlinked out of the repo is refused, not followed', async () => {
  // esc()-style path checks are not enough: realpath containment is what stops
  // a symlink in a repo you control from turning this into a file-read oracle.
  const repoDir = join(HOME_DIR, 'realrepo');
  const secret = join(HOME_DIR, 'outside-secret.md');
  writeFileSync(secret, '# nope');
  symlinkSync(secret, join(repoDir, 'DESIGN.md'));

  const r = await fetch(`${base()}/api/repos/test-realapp/doc/DESIGN`, withCookie());
  expect(r.status).toBe(403);
  expect((await r.json()) as { error: string }).toEqual({ error: 'forbidden path' });
});

test('captured tickets never inherit the SERVER cwd as their app', async () => {
  // The board server runs from wherever `smriti` was started, which has nothing
  // to do with what you are looking at. Omitting --repo let smriti-ticket
  // derive one from that cwd; '-' says "no app" explicitly.
  const r = await fetch(`${base()}/api/tickets`, {
    method: 'POST',
    headers: { cookie: jar, 'content-type': 'application/json' },
    body: JSON.stringify({ title: 'an idea with no app' }),
  });
  expect(r.status).toBe(200);
  const { id } = (await r.json()) as { id: number };

  const s = (await (await fetch(`${base()}/api/state`, withCookie())).json()) as {
    tickets: { id: number; repo_slug: string | null }[];
  };
  expect(s.tickets.find((t) => t.id === id)?.repo_slug).toBeNull();
});

// ─── the click-through into a live gate (T8) ──────────────────────────────
// The board already knew a run was parked at a gate; it could not take you
// there. The join is a session id on the run, and the URL is resolved — never
// stored — because the port dies with the server.

const HTMLBIN = join(REPO_ROOT, 'bin', 'smriti-html');

function serveSpec(): { sessionId: string; port: number } {
  const spec = join(HOME_DIR, 'gate-spec.json');
  writeFileSync(spec, JSON.stringify({
    title: 'Plan', skill: 'begin', session_id: 'pending', revision_id: 'rev-1', source_hash: 'h',
    sections: [{ id: 's', title: 'S', cards: [{ id: 'c1', title: 't', body_md: 'b' }] }],
  }));
  // --no-trace: this test drives the trace itself, so the transport must not
  // also be writing gate events underneath the assertions.
  const out = spawnSync('bun', [HTMLBIN, 'serve', spec, '--no-open', '--no-trace'], {
    encoding: 'utf8', env: { ...process.env, SMRITI_HOME: HOME_DIR },
  });
  const j = JSON.parse(out.stdout) as { session_id: string; port: number };
  return { sessionId: j.session_id, port: j.port };
}
const stopSession = (id: string) =>
  spawnSync('bun', [HTMLBIN, 'stop', '--session', id], {
    encoding: 'utf8', env: { ...process.env, SMRITI_HOME: HOME_DIR },
  });

test('/api/state resolves html_url for an awaiting run whose gate is live', async () => {
  const { sessionId, port } = serveSpec();
  const uid = tr(['start', 'begin']).stdout.trim().split('=')[1];
  tr(['emit', 'approve', 'awaiting', '--run', uid, '--html-session', sessionId]);

  const s = (await (await fetch(`${base()}/api/state`, withCookie())).json()) as {
    runs: (ApiRun & { html_session?: string; html_url?: string })[];
  };
  const run = s.runs.find((r) => r.run_uid === uid)!;
  expect(run.status).toBe('awaiting');
  expect(run.html_session).toBe(sessionId);
  // Synthesized from a validated port, not taken from the resolver's string.
  expect(run.html_url).toBe(`http://127.0.0.1:${port}/`);

  stopSession(sessionId);
  tr(['end', '--run', uid]);
});

test('/api/state omits html_url once that server is gone — never a dead link', async () => {
  const { sessionId } = serveSpec();
  const uid = tr(['start', 'begin']).stdout.trim().split('=')[1];
  tr(['emit', 'approve', 'awaiting', '--run', uid, '--html-session', sessionId]);
  stopSession(sessionId);

  const s = (await (await fetch(`${base()}/api/state`, withCookie())).json()) as {
    runs: (ApiRun & { html_session?: string; html_url?: string })[];
  };
  const run = s.runs.find((r) => r.run_uid === uid)!;
  expect(run.status).toBe('awaiting');   // still parked...
  expect(run.html_session).toBe(sessionId);
  expect(run.html_url).toBeUndefined();  // ...but nowhere to click
  tr(['end', '--run', uid]);
});

test('/api/state does not resolve a URL for a run that is not at a gate', async () => {
  // A running run is never asked about: the resolution is bounded to the rows
  // in "waiting on you", which is what keeps it a handful of probes per poll.
  const { sessionId } = serveSpec();
  const uid = tr(['start', 'begin']).stdout.trim().split('=')[1];
  tr(['emit', 'approve', 'awaiting', '--run', uid, '--html-session', sessionId]);
  tr(['emit', 'implement', 'start', '--run', uid]);   // gate closed, still working

  const s = (await (await fetch(`${base()}/api/state`, withCookie())).json()) as {
    runs: (ApiRun & { html_session?: string | null; html_url?: string })[];
  };
  const run = s.runs.find((r) => r.run_uid === uid)!;
  expect(run.status).toBe('running');
  expect(run.html_session).toBeNull();
  expect(run.html_url).toBeUndefined();

  stopSession(sessionId);
  tr(['end', '--run', uid]);
});
