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
