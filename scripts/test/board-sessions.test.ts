// How the board talks to herdr, pinned against a recording stub.
//
// Every bug in this seam was invisible from inside smriti: the board reported a
// started session, herdr agreed it had started one, and the session sat there
// having been told nothing. So what is locked down here is the exact argv, and
// the fact that the prompt is actually typed — not that a launch "succeeded".

import { test, expect, beforeAll, afterAll } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const REPO_ROOT = join(import.meta.dir, '..', '..');
const BOARD = join(REPO_ROOT, 'bin', 'smriti-board');
const TICKET = join(REPO_ROOT, 'bin', 'smriti-ticket');

let HOME_DIR = '';
let STUB_BIN = '';
let LOG = '';
let CWD_FILE = '';
let REPO = '';
let port = 0;
let jar = '';

// A herdr that answers plausibly and writes down every call. The agent it lists
// has NO name, which is not hypothetical: herdr forgets the name it was given,
// and a real session was found listed this way with `agent read t3` answering
// agent_not_found.
// The listed agent's cwd is read from a file on every call, so a test can move
// the session onto a given worktree and watch what the board decides.
const HERDR_STUB = `#!/usr/bin/env bash
printf '%s\\n' "$*" >> "$HERDR_LOG"
cwd=$(cat "$STUB_CWD_FILE" 2>/dev/null)
case "$1 $2" in
  "worktree open") echo '{"result":{"root_pane":{"pane_id":"w1:p1"}}}' ;;
  "agent start")   echo '{"result":{"started":true}}' ;;
  "agent list")    echo "{\\"result\\":{\\"agents\\":[{\\"agent\\":\\"claude\\",\\"agent_status\\":\\"blocked\\",\\"cwd\\":\\"$cwd\\",\\"pane_id\\":\\"w1:p1\\"}]}}" ;;
  *)               echo '{"result":{}}' ;;
esac
exit 0
`;

function board(args: string[], env: Record<string, string> = {}) {
  return spawnSync('bun', [BOARD, ...args], {
    encoding: 'utf8',
    env: {
      ...process.env,
      SMRITI_HOME: HOME_DIR,
      SMRITI_BOARD_IDLE_MS: '60000',
      PATH: `${STUB_BIN}:${process.env.PATH}`,
      HERDR_LOG: LOG,
      STUB_CWD_FILE: CWD_FILE,
      ...env,
    },
  });
}
const base = () => `http://127.0.0.1:${port}`;
const cookie = () => ({ headers: { cookie: jar } });
const log = () => (existsSync(LOG) ? readFileSync(LOG, 'utf8') : '');

beforeAll(async () => {
  HOME_DIR = mkdtempSync(join(tmpdir(), 'smriti-sess-'));
  STUB_BIN = join(HOME_DIR, 'stubbin');
  LOG = join(HOME_DIR, 'herdr.log');
  CWD_FILE = join(HOME_DIR, 'stub-cwd');
  // Somewhere that is not any ticket's worktree, so the first start is a start.
  writeFileSync(CWD_FILE, '/nowhere/unrelated-session');
  mkdirSync(STUB_BIN, { recursive: true });
  writeFileSync(join(STUB_BIN, 'herdr'), HERDR_STUB);
  chmodSync(join(STUB_BIN, 'herdr'), 0o755);

  // A real repo: the board asks git for the worktree root, and smriti-ticket
  // cuts a real worktree. Stubbing those would test nothing.
  REPO = join(HOME_DIR, 'repo');
  mkdirSync(REPO, { recursive: true });
  const git = (...a: string[]) => spawnSync('git', ['-C', REPO, ...a], { encoding: 'utf8' });
  spawnSync('git', ['init', '-q', '-b', 'main', REPO], { encoding: 'utf8' });
  git('config', 'user.email', 'test@example.com');
  git('config', 'user.name', 'test');
  writeFileSync(join(REPO, 'README.md'), '# t\n');
  git('add', '-A');
  git('commit', '-qm', 'init');
  git('remote', 'add', 'origin', 'https://github.com/test/sessions-probe.git');

  // smriti-ticket is bash; running it through bun silently does nothing.
  const add = spawnSync(TICKET, ['add', 'session argv probe', '--ready'], {
    encoding: 'utf8',
    cwd: REPO,
    env: { ...process.env, SMRITI_HOME: HOME_DIR },
  });
  expect(add.status).toBe(0);

  const r = board(['--url']);
  expect(r.status).toBe(0);
  const url = new URL(r.stdout.trim());
  port = Number(url.port);
  const ex = await fetch(`${base()}/?k=${url.searchParams.get('k')}`, { redirect: 'manual' });
  jar = (ex.headers.get('set-cookie') || '').split(';')[0];
  expect(jar).toStartWith('smriti_board=');
});

afterAll(() => {
  board(['stop']);
  rmSync(HOME_DIR, { recursive: true, force: true });
});

test('a herdr agent with no name still reaches the board', async () => {
  const r = await fetch(`${base()}/api/state`, cookie());
  const body = await r.json();
  // The old filter dropped every nameless agent, so this array was empty and the
  // board showed no live session at all: no blocked indicator, and `start`
  // offered again on work already running.
  expect(Array.isArray(body.sessions)).toBe(true);
  expect(body.sessions.length).toBe(1);
  expect(body.sessions[0].status).toBe('blocked');
  expect(body.sessions[0].pane).toBe('w1:p1');
});

test('agent start passes flags only, and the prompt is typed in afterwards', async () => {
  const r = await fetch(`${base()}/api/tickets/1/start`, {
    method: 'POST',
    body: '{}',
    ...cookie(),
  });
  expect(r.status).toBe(200);
  const body = await r.json();
  expect(body.method).toBe('herdr');
  expect(body.prompting).toBe(true);

  const start = log().split('\n').find((l) => l.startsWith('agent start')) ?? '';
  expect(start).toContain('--kind claude');
  expect(start).toContain('-- --dangerously-skip-permissions');
  // `--kind claude` already chose the executable. Naming it again ran
  // `claude claude …`, and the prompt was swallowed as an argument to nothing —
  // which is why sessions opened on a bare prompt having been told nothing.
  expect(start).not.toContain('claude claude');
  expect(start).not.toContain('/begin');

  // Delivery is deliberately off the request path (it waits on claude booting,
  // and spawnSync would freeze the single event loop the whole board runs on),
  // so it lands shortly after the response.
  for (let i = 0; i < 60 && !log().includes('send-text'); i++) await Bun.sleep(250);
  const sent = log().split('\n').find((l) => l.startsWith('pane send-text')) ?? '';
  expect(sent).toContain('/begin ticket:1');
  // The typed text is not submitted until Enter, and claude will not accept
  // either until its input box exists — hence the wait before this.
  expect(log()).toContain('pane wait-output');
  for (let i = 0; i < 40 && !log().includes('send-keys w1:p1 Enter'); i++) await Bun.sleep(250);
  expect(log()).toContain('send-keys w1:p1 Enter');
});

test('a nameless session on the ticket worktree is recognised, not duplicated', async () => {
  const t = spawnSync(TICKET, ['show', '1', '--json'], {
    encoding: 'utf8',
    env: { ...process.env, SMRITI_HOME: HOME_DIR },
  });
  const wt = JSON.parse(t.stdout).ticket.worktree_path as string;
  expect(wt).toBeTruthy();

  // Move the (still nameless) session onto this ticket's worktree. That is the
  // only thing tying it to the ticket, and it is what the board must match on.
  writeFileSync(CWD_FILE, wt);
  const before = log().split('\n').filter((l) => l.startsWith('agent start')).length;

  const r = await fetch(`${base()}/api/tickets/1/start`, { method: 'POST', body: '{}', ...cookie() });
  const body = await r.json();
  expect(body.existing).toBe(true);
  expect(body.agentStatus).toBe('blocked');
  // And no second agent was started for work already running.
  expect(log().split('\n').filter((l) => l.startsWith('agent start')).length).toBe(before);
});
