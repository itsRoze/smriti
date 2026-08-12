// Restarting a session — the OTHER place the board closes a pane.
//
// Ticket #6 established "nothing is closed that has not first been captured"
// and implemented it in the ship sweep only. This route is where the invariant
// matters most and held least: you press restart when a run has gone wrong,
// which is exactly when what it printed is worth keeping, and until #23 the
// route closed the pane having read nothing.
//
// The sweep's own rules are pinned in board-close.test.ts. What is pinned HERE
// is the one place the two deliberately diverge — an uncapturable pane stays
// open for the sweep and is closed anyway for restart — plus the states restart
// meets that the sweep never does, chiefly `working`.

import { test, expect, beforeAll, afterAll } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, renameSync, existsSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const REPO_ROOT = join(import.meta.dir, '..', '..');
const BOARD = join(REPO_ROOT, 'bin', 'smriti-board');
const TICKET = join(REPO_ROOT, 'bin', 'smriti-ticket');
const TRACE = join(REPO_ROOT, 'bin', 'smriti-trace');

let HOME_DIR = '';
let STUB_BIN = '';
let LOG = '';
let STATE_FILE = '';
let READ_FILE = '';
let REPO = '';
let port = 0;
let jar = '';

// Same recording stub as board-close.test.ts, plus the two calls a relaunch
// makes (`worktree open`, `agent start`) so restart can finish and be observed
// end to end rather than only up to the close.
//
// Unlike every other herdr stub in this suite, this one can emit a NAME. That
// omission is why the machine-global `t<id>` match survived untested for so
// long: with no name in the fixture the clause could never fire, so nothing
// noticed it adopting sessions it had no business touching.
const HERDR_STUB = `#!/usr/bin/env bash
printf '%s\\n' "$*" >> "$HERDR_LOG"
{ read -r cwd; read -r st; read -r pane; read -r nm; } < "$STUB_STATE_FILE" 2>/dev/null
case "$1 $2" in
  "agent list")     echo "{\\"result\\":{\\"agents\\":[{\\"agent\\":\\"claude\\",\\"agent_status\\":\\"$st\\",\\"cwd\\":\\"$cwd\\",\\"pane_id\\":\\"$pane\\",\\"name\\":\\"$nm\\"}]}}" ;;
  "pane read")      cat "$STUB_READ_FILE" 2>/dev/null ;;
  "pane close")     echo '{"result":{"closed":true}}' ;;
  "worktree open")  echo '{"result":{"root_pane":{"pane_id":"wNEW:p1"}}}' ;;
  "agent start")    echo '{"result":{"started":true}}' ;;
  *)                echo '{"result":{}}' ;;
esac
exit 0
`;

const env = (extra: Record<string, string> = {}) => ({
  ...process.env,
  SMRITI_HOME: HOME_DIR,
  SMRITI_BOARD_IDLE_MS: '60000',
  PATH: `${STUB_BIN}:${process.env.PATH}`,
  HERDR_LOG: LOG,
  STUB_STATE_FILE: STATE_FILE,
  STUB_READ_FILE: READ_FILE,
  ...extra,
});

const board = (args: string[]) => spawnSync('bun', [BOARD, ...args], { encoding: 'utf8', env: env() });
const cli = (bin: string, args: string[], cwd = REPO) =>
  spawnSync(bin, args, { encoding: 'utf8', cwd, env: env() });
const log = () => (existsSync(LOG) ? readFileSync(LOG, 'utf8') : '');
const closes = (pane: string) => log().split('\n').filter((l) => l === `pane close ${pane}`).length;
const reads = (pane: string) => log().split('\n').filter((l) => l.startsWith(`pane read ${pane} `)).length;
const starts = () => log().split('\n').filter((l) => l.startsWith('agent start')).length;

const base = () => `http://127.0.0.1:${port}`;
const restart = (id: string) =>
  fetch(`${base()}/api/tickets/${id}/restart`, { method: 'POST', body: '{}', headers: { cookie: jar } });

async function until(fn: () => boolean, ms = 6000): Promise<boolean> {
  for (let i = 0; i < ms / 100; i++) {
    if (fn()) return true;
    await Bun.sleep(100);
  }
  return fn();
}

const artifacts = (uid: string) =>
  JSON.parse(spawnSync(TRACE, ['artifacts', '--run', uid, '--json'],
    { encoding: 'utf8', cwd: REPO, env: env() }).stdout) as
    { source: string; kind: string; body: string | null }[];

const runRow = (uid: string) =>
  (JSON.parse(spawnSync(TRACE, ['list', '--limit', '500', '--json'],
    { encoding: 'utf8', cwd: REPO, env: env() }).stdout) as
    { run_uid: string; status: string; ended_at: string | null }[]).find((r) => r.run_uid === uid);

// A ticket that is genuinely in progress: live worktree, and a run stamped with
// the pane it is executing in, exactly as `trace start` does inside a herdr
// pane. Unlike the sweep's fixture, nothing here is shipped and the worktree
// stays on disk — that is the whole difference between the two call sites.
function liveTicket(title: string, pane: string): { id: string; wt: string; uid: string } {
  const add = cli(TICKET, ['add', title, '--ready']);
  expect(add.status).toBe(0);
  const id = (add.stdout.match(/#(\d+)/) ?? [])[1];
  expect(id).toBeTruthy();

  const start = cli(TICKET, ['start', id!]);
  expect(start.status).toBe(0);
  const wt = start.stdout.trim().split('\n')[0];
  expect(existsSync(wt)).toBe(true);

  const run = spawnSync(TRACE, ['start', 'begin', '--ticket', id!], {
    encoding: 'utf8', cwd: wt, env: env({ HERDR_PANE_ID: pane }),
  });
  expect(run.status).toBe(0);
  return { id: id!, wt, uid: run.stdout.trim().split('=')[1]! };
}

// Atomic for the same reason board-close.test.ts does it: the board's own sweep
// timer reads this file and must never catch it half-written.
function session(wt: string, status: string, pane: string, name = '') {
  writeFileSync(STATE_FILE + '.tmp', [wt, status, pane, name].join('\n') + '\n');
  renameSync(STATE_FILE + '.tmp', STATE_FILE);
}

beforeAll(async () => {
  HOME_DIR = mkdtempSync(join(tmpdir(), 'smriti-restart-'));
  STUB_BIN = join(HOME_DIR, 'stubbin');
  LOG = join(HOME_DIR, 'herdr.log');
  STATE_FILE = join(HOME_DIR, 'stub-state');
  READ_FILE = join(HOME_DIR, 'stub-read');
  mkdirSync(STUB_BIN, { recursive: true });
  writeFileSync(join(STUB_BIN, 'herdr'), HERDR_STUB);
  chmodSync(join(STUB_BIN, 'herdr'), 0o755);
  writeFileSync(STATE_FILE, ['/nowhere/unrelated', 'idle', 'w0:p0'].join('\n') + '\n');
  writeFileSync(READ_FILE, '');

  REPO = join(HOME_DIR, 'repo');
  mkdirSync(REPO, { recursive: true });
  spawnSync('git', ['init', '-q', '-b', 'main', REPO], { encoding: 'utf8' });
  const git = (...a: string[]) => spawnSync('git', ['-C', REPO, ...a], { encoding: 'utf8' });
  git('config', 'user.email', 'test@example.com');
  git('config', 'user.name', 'test');
  writeFileSync(join(REPO, 'README.md'), '# t\n');
  git('add', '-A');
  git('commit', '-qm', 'init');
  git('remote', 'add', 'origin', 'https://github.com/test/restart-probe.git');

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

test('restart reads the pane before closing it', async () => {
  const { id, wt } = liveTicket('capture then close', 'wR:p1');
  writeFileSync(READ_FILE, 'what the run had printed\n');
  session(wt, 'working', 'wR:p1');

  expect((await restart(id)).status).toBe(200);
  expect(await until(() => closes('wR:p1') > 0)).toBe(true);

  // Stated separately, because findIndex answers -1 for a read that never
  // happened and -1 is "before" everything — which is exactly the pre-#23
  // behaviour this test exists to catch.
  expect(reads('wR:p1')).toBeGreaterThan(0);
  const lines = log().split('\n');
  expect(lines.findIndex((l) => l.startsWith('pane read wR:p1'))).toBeLessThan(
    lines.findIndex((l) => l === 'pane close wR:p1'));
});

test('a working session is captured — the case the sweep refuses and this one cannot', async () => {
  // The sweep only ever acts on idle/done. Restart is reached precisely when a
  // run is stuck or mid-flight, and the ticket predicted this was impossible
  // because a working agent's pane could not be read. It can: herdr answers
  // `pane read` the same whatever the lifecycle state.
  const { id, wt, uid } = liveTicket('working when replaced', 'wS:p1');
  writeFileSync(READ_FILE, 'mid-flight output worth keeping\n');
  session(wt, 'working', 'wS:p1');

  expect((await restart(id)).status).toBe(200);
  expect(await until(() => closes('wS:p1') > 0)).toBe(true);

  expect(await until(() => artifacts(uid).length === 1)).toBe(true);
  const rows = artifacts(uid);
  expect(rows[0].kind).toBe('report');
  // Never dressed up as the run's own words — it is one viewport of a session
  // that was still working.
  expect(rows[0].source).toBe('pane');
  expect(rows[0].body).toContain('mid-flight output worth keeping');
});

test('restart closes even when the pane cannot be captured', async () => {
  // The deliberate divergence from the sweep, which leaves an uncapturable pane
  // open. You asked for this session to be replaced; refusing would leave you
  // holding the broken one. Pinned so it cannot be "fixed" into consistency.
  const { id, wt } = liveTicket('uncapturable but replaced', 'wT:p1');
  writeFileSync(READ_FILE, '');
  session(wt, 'working', 'wT:p1');

  expect((await restart(id)).status).toBe(200);
  expect(await until(() => closes('wT:p1') > 0)).toBe(true);
  expect(reads('wT:p1')).toBeGreaterThan(0);
});

test('the capture lands on the run holding that pane, not the ticket\'s newest', async () => {
  // A ticket accumulates a run per restart. Resolving by "newest run for this
  // ticket" would file one pane's terminal under a run that was never in it,
  // which is worse than filing it nowhere — so the match is on the pane alone.
  const { id, wt, uid: oldUid } = liveTicket('two runs, one pane', 'wU:p1');
  // A newer run on the same ticket, in a DIFFERENT pane.
  const newer = spawnSync(TRACE, ['start', 'begin', '--ticket', id], {
    encoding: 'utf8', cwd: wt, env: env({ HERDR_PANE_ID: 'wU:p9' }),
  });
  const newUid = newer.stdout.trim().split('=')[1]!;

  writeFileSync(READ_FILE, 'belongs to the OLD pane\n');
  session(wt, 'working', 'wU:p1');

  expect((await restart(id)).status).toBe(200);
  expect(await until(() => closes('wU:p1') > 0)).toBe(true);

  // The run stamped with wU:p1 got it...
  expect(await until(() => artifacts(oldUid).length === 1)).toBe(true);
  expect(artifacts(oldUid)[0].body).toContain('belongs to the OLD pane');
  // ...and the newer run, which was never in that pane, got nothing.
  expect(artifacts(newUid).length).toBe(0);
});

test('the replaced run is ended, not left ticking forever', async () => {
  // The process that would have called `trace end` has just been killed, so
  // without this the run stays `running` and keeps billing a live duration for
  // a session that no longer exists.
  const { id, wt, uid } = liveTicket('ended on replace', 'wV:p1');
  writeFileSync(READ_FILE, 'still on screen\n');
  session(wt, 'working', 'wV:p1');

  expect((await restart(id)).status).toBe(200);
  expect(await until(() => closes('wV:p1') > 0)).toBe(true);
  // `failed` rather than `done`: it did not finish, you replaced it.
  expect(await until(() => runRow(uid)?.status === 'failed')).toBe(true);
  expect(runRow(uid)!.ended_at).toBeTruthy();
});

test('a pane with no run behind it is still closed, and does not error', async () => {
  // You can press start and then restart before /begin has called `trace start`
  // at all. There is no run to capture into and nothing yet worth keeping, so
  // the replacement proceeds rather than the button failing.
  const add = cli(TICKET, ['add', 'restarted before it ever ran', '--ready']);
  const id = (add.stdout.match(/#(\d+)/) ?? [])[1]!;
  const wt = cli(TICKET, ['start', id]).stdout.trim().split('\n')[0];
  writeFileSync(READ_FILE, 'output nobody can file anywhere\n');
  session(wt, 'working', 'wW:p1');

  expect((await restart(id)).status).toBe(200);
  expect(await until(() => closes('wW:p1') > 0)).toBe(true);
});

test('restart does not adopt a same-named session in another directory', async () => {
  // herdr's agent names are machine-global, so a `t<id>` belonging to another
  // checkout answered for this ticket's session — and restart would then have
  // CLOSED it, destroying a live terminal and filing it under a ticket it had
  // nothing to do with. That is how a fixture came to adopt a real session
  // during ticket 3. Matching is on the worktree and only the worktree.
  const { id, wt } = liveTicket('mine, with a namesake listed', 'wX:p1');
  const other = cli(TICKET, ['add', 'someone else entirely', '--ready']);
  const otherId = (other.stdout.match(/#(\d+)/) ?? [])[1]!;
  const otherWt = cli(TICKET, ['start', otherId]).stdout.trim().split('\n')[0];
  expect(otherWt).not.toBe(wt);

  // The only listed agent is in the OTHER ticket's worktree — but it carries
  // exactly the name this restart used to look for.
  writeFileSync(READ_FILE, 'the namesake\'s terminal\n');
  session(otherWt, 'working', 'wX:p1', `t${id}`);

  expect((await restart(id)).status).toBe(200);
  await Bun.sleep(1200);
  expect(closes('wX:p1')).toBe(0);
  expect(reads('wX:p1')).toBe(0);
});

test('two restarts at once start one replacement, not two', async () => {
  // The route destroys a pane and then starts a replacement. Two interleaved
  // start two sessions against one closed pane. It was a narrow race while the
  // route was synchronous; capturing first makes it slower and reachable.
  const { id, wt } = liveTicket('double clicked', 'wY:p1');
  writeFileSync(READ_FILE, 'clicked twice\n');
  session(wt, 'working', 'wY:p1');

  const before = starts();
  const [a, b] = await Promise.all([restart(id), restart(id)]);
  const codes = [a.status, b.status].sort();
  expect(codes).toEqual([200, 409]);

  // Exactly one replacement session, and the pane closed once.
  expect(await until(() => starts() === before + 1)).toBe(true);
  await Bun.sleep(800);
  expect(starts()).toBe(before + 1);
  expect(closes('wY:p1')).toBe(1);
});
