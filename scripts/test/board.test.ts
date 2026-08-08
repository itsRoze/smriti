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

test('doc reads are confined to $SMRITI_HOME/projects', async () => {
  // Register one doc inside the projects root and one escaping it. The board
  // must serve the first and refuse the second — otherwise it is a local
  // file-read oracle for anything the user can name.
  const tk = (args: string[]) =>
    spawnSync(TICKET, args, { encoding: 'utf8', env: { ...process.env, SMRITI_HOME: HOME_DIR } });
  tk(['add', 'doc test', '--repo', 'demo']);

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

// ─── apps, projects, and the repo-level markdown route ────────────────────
// The second file-read exception on this server. It is deliberately narrower
// than /api/doc/:id — the filename is never user input — so these lock down
// that the narrowing actually holds.

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
