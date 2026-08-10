// Closing a session once its ticket has shipped — pinned against a recording
// herdr stub, the same way board-sessions.test.ts pins starting one.
//
// What matters here is what the board REFUSES to close. Closing a pane destroys
// a terminal nobody can get back, and until this feature existed it also
// destroyed the only copy of what the run concluded. So every negative case
// below is load-bearing: a sweep that is merely eager is worse than no sweep.

import { test, expect, beforeAll, afterAll } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const REPO_ROOT = join(import.meta.dir, '..', '..');
const BOARD = join(REPO_ROOT, 'bin', 'smriti-board');
const TICKET = join(REPO_ROOT, 'bin', 'smriti-ticket');
const TRACE = join(REPO_ROOT, 'bin', 'smriti-trace');

let HOME_DIR = '';
let STUB_BIN = '';
let LOG = '';
let CWD_FILE = '';
let STATUS_FILE = '';
let PANE_FILE = '';
let READ_FILE = '';
let REPO = '';

// Everything the stub answers is read from a file on each call, so a test can
// move the session, change its lifecycle state, or make a pane unreadable, and
// then watch what the board decides. `pane read` echoes a file whose emptiness
// means "this pane cannot be captured" — the case where the board must NOT
// close.
const HERDR_STUB = `#!/usr/bin/env bash
printf '%s\\n' "$*" >> "$HERDR_LOG"
cwd=$(cat "$STUB_CWD_FILE" 2>/dev/null)
st=$(cat "$STUB_STATUS_FILE" 2>/dev/null)
pane=$(cat "$STUB_PANE_FILE" 2>/dev/null)
case "$1 $2" in
  "agent list")  echo "{\\"result\\":{\\"agents\\":[{\\"agent\\":\\"claude\\",\\"agent_status\\":\\"$st\\",\\"cwd\\":\\"$cwd\\",\\"pane_id\\":\\"$pane\\"}]}}" ;;
  "pane read")   cat "$STUB_READ_FILE" 2>/dev/null ;;
  "pane close")  echo '{"result":{"closed":true}}' ;;
  *)             echo '{"result":{}}' ;;
esac
exit 0
`;

const env = (extra: Record<string, string> = {}) => ({
  ...process.env,
  SMRITI_HOME: HOME_DIR,
  SMRITI_BOARD_IDLE_MS: '60000',
  SMRITI_BOARD_SWEEP_MS: '300',
  PATH: `${STUB_BIN}:${process.env.PATH}`,
  HERDR_LOG: LOG,
  STUB_CWD_FILE: CWD_FILE,
  STUB_STATUS_FILE: STATUS_FILE,
  STUB_PANE_FILE: PANE_FILE,
  STUB_READ_FILE: READ_FILE,
  ...extra,
});

const board = (args: string[]) => spawnSync('bun', [BOARD, ...args], { encoding: 'utf8', env: env() });
const cli = (bin: string, args: string[], cwd = REPO) =>
  spawnSync(bin, args, { encoding: 'utf8', cwd, env: env() });
const log = () => (existsSync(LOG) ? readFileSync(LOG, 'utf8') : '');
const closes = (pane: string) => log().split('\n').filter((l) => l === `pane close ${pane}`).length;

// The sweep is a timer, not a request, so there is nothing to await. Poll for
// the outcome; the negative assertions instead wait a fixed span and assert
// nothing happened, which is the only honest shape for "must not".
async function until(fn: () => boolean, ms = 6000): Promise<boolean> {
  for (let i = 0; i < ms / 100; i++) {
    if (fn()) return true;
    await Bun.sleep(100);
  }
  return fn();
}
const sweepsPassed = () => Bun.sleep(1500);

// One shipped ticket whose worktree is gone, ready for the sweep to consider.
// Returns its worktree path and the run uid stamped with `pane`.
function shippedTicket(title: string, pane: string): { wt: string; uid: string } {
  const add = cli(TICKET, ['add', title, '--ready']);
  expect(add.status).toBe(0);
  const id = (add.stdout.match(/#(\d+)/) ?? [])[1];
  expect(id).toBeTruthy();

  const start = cli(TICKET, ['start', id!]);
  expect(start.status).toBe(0);
  const wt = start.stdout.trim().split('\n')[0];
  expect(existsSync(wt)).toBe(true);

  // The run records the pane it is executing in, exactly as `trace start` does
  // inside a herdr pane.
  const run = spawnSync(TRACE, ['start', 'begin', '--ticket', id!], {
    encoding: 'utf8', cwd: wt, env: env({ HERDR_PANE_ID: pane }),
  });
  expect(run.status).toBe(0);
  const uid = run.stdout.trim().split('=')[1];

  cli(TICKET, ['done', id!]);
  // What `smriti clean` does: the worktree goes, and the pane is left pointing
  // at a directory that no longer exists.
  spawnSync('git', ['-C', REPO, 'worktree', 'remove', '--force', wt], { encoding: 'utf8' });
  expect(existsSync(wt)).toBe(false);
  return { wt, uid };
}

function storeReport(uid: string, body: string, source = 'run') {
  const r = spawnSync(TRACE, ['report', '--run', uid, '--source', source], {
    encoding: 'utf8', cwd: REPO, env: env(), input: body,
  });
  expect(r.status).toBe(0);
}

// Point the stub's single agent at a worktree, in a given lifecycle state.
function session(wt: string, status: string, pane: string) {
  writeFileSync(CWD_FILE, wt);
  writeFileSync(STATUS_FILE, status);
  writeFileSync(PANE_FILE, pane);
}

beforeAll(() => {
  HOME_DIR = mkdtempSync(join(tmpdir(), 'smriti-close-'));
  STUB_BIN = join(HOME_DIR, 'stubbin');
  LOG = join(HOME_DIR, 'herdr.log');
  CWD_FILE = join(HOME_DIR, 'stub-cwd');
  STATUS_FILE = join(HOME_DIR, 'stub-status');
  PANE_FILE = join(HOME_DIR, 'stub-pane');
  READ_FILE = join(HOME_DIR, 'stub-read');
  mkdirSync(STUB_BIN, { recursive: true });
  writeFileSync(join(STUB_BIN, 'herdr'), HERDR_STUB);
  chmodSync(join(STUB_BIN, 'herdr'), 0o755);
  writeFileSync(CWD_FILE, '/nowhere/unrelated');
  writeFileSync(STATUS_FILE, 'idle');
  writeFileSync(PANE_FILE, 'w0:p0');
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
  git('remote', 'add', 'origin', 'https://github.com/test/close-probe.git');

  expect(board(['--url']).status).toBe(0);
});

afterAll(() => {
  board(['stop']);
  rmSync(HOME_DIR, { recursive: true, force: true });
});

test('a shipped ticket whose run wrote a report gets its session closed', async () => {
  const { wt, uid } = shippedTicket('closes when captured', 'wA:p1');
  storeReport(uid, 'built: the thing\nreview: clean\n');
  session(wt, 'idle', 'wA:p1');
  expect(await until(() => closes('wA:p1') > 0)).toBe(true);
});

test('`done` counts as finished — it is idle for work nobody watched', async () => {
  // herdr reports `done`, not `idle`, when work finishes while the tab has not
  // been seen in the focused UI, and CLI reads never mark a tab seen. A sweep
  // that only accepted `idle` would miss precisely the case this exists for.
  const { wt, uid } = shippedTicket('closes when done', 'wB:p1');
  storeReport(uid, 'built: the thing\n');
  session(wt, 'done', 'wB:p1');
  expect(await until(() => closes('wB:p1') > 0)).toBe(true);
});

test('a working session is never closed', async () => {
  const { wt, uid } = shippedTicket('still working', 'wC:p1');
  storeReport(uid, 'built: the thing\n');
  session(wt, 'working', 'wC:p1');
  await sweepsPassed();
  expect(closes('wC:p1')).toBe(0);
});

test('a blocked session is never closed — it is sitting at a question', async () => {
  const { wt, uid } = shippedTicket('blocked at a prompt', 'wD:p1');
  storeReport(uid, 'built: the thing\n');
  session(wt, 'blocked', 'wD:p1');
  await sweepsPassed();
  expect(closes('wD:p1')).toBe(0);
});

test('`unknown` is not treated as finished — it does not prove completion', async () => {
  const { wt, uid } = shippedTicket('unknown state', 'wE:p1');
  storeReport(uid, 'built: the thing\n');
  session(wt, 'unknown', 'wE:p1');
  await sweepsPassed();
  expect(closes('wE:p1')).toBe(0);
});

test('a ticket that has not shipped keeps its session', async () => {
  const add = cli(TICKET, ['add', 'not shipped yet', '--ready']);
  const id = (add.stdout.match(/#(\d+)/) ?? [])[1]!;
  const wt = cli(TICKET, ['start', id]).stdout.trim().split('\n')[0];
  const run = spawnSync(TRACE, ['start', 'begin', '--ticket', id], {
    encoding: 'utf8', cwd: wt, env: env({ HERDR_PANE_ID: 'wF:p1' }),
  });
  storeReport(run.stdout.trim().split('=')[1], 'built: the thing\n');
  spawnSync('git', ['-C', REPO, 'worktree', 'remove', '--force', wt], { encoding: 'utf8' });
  session(wt, 'idle', 'wF:p1');
  await sweepsPassed();
  expect(closes('wF:p1')).toBe(0);
});

test('a shipped ticket whose worktree still exists keeps its session', async () => {
  const add = cli(TICKET, ['add', 'worktree still there', '--ready']);
  const id = (add.stdout.match(/#(\d+)/) ?? [])[1]!;
  const wt = cli(TICKET, ['start', id]).stdout.trim().split('\n')[0];
  const run = spawnSync(TRACE, ['start', 'begin', '--ticket', id], {
    encoding: 'utf8', cwd: wt, env: env({ HERDR_PANE_ID: 'wG:p1' }),
  });
  storeReport(run.stdout.trim().split('=')[1], 'built: the thing\n');
  cli(TICKET, ['done', id]);
  // Deliberately NOT removed: a shipped ticket whose worktree is still on disk
  // is a session someone may well still be using.
  expect(existsSync(wt)).toBe(true);
  session(wt, 'idle', 'wG:p1');
  await sweepsPassed();
  expect(closes('wG:p1')).toBe(0);
});

test('with no report, the pane is scraped first — and recorded as a scrape', async () => {
  const { wt, uid } = shippedTicket('scraped fallback', 'wH:p1');
  writeFileSync(READ_FILE, '  ✅ /begin complete on t-scraped\n     built: from the terminal\n');
  session(wt, 'idle', 'wH:p1');
  expect(await until(() => closes('wH:p1') > 0)).toBe(true);

  const arts = spawnSync(TRACE, ['artifacts', '--run', uid, '--json'], { encoding: 'utf8', cwd: REPO, env: env() });
  const rows = JSON.parse(arts.stdout);
  expect(rows.length).toBe(1);
  // Never dressed up as the run's own words.
  expect(rows[0].source).toBe('pane');
  expect(rows[0].body).toContain('from the terminal');
  // And the scrape happened BEFORE the close, not after it.
  const lines = log().split('\n');
  expect(lines.findIndex((l) => l.startsWith('pane read wH:p1'))).toBeLessThan(
    lines.findIndex((l) => l === 'pane close wH:p1'));
});

test('a pane that cannot be captured is left open, not closed blind', async () => {
  // Losing the only copy of what the run said is the bug this whole feature
  // exists to prevent, so an unreadable pane stays visible and yours to close.
  const { wt } = shippedTicket('uncapturable', 'wI:p1');
  writeFileSync(READ_FILE, '');
  session(wt, 'idle', 'wI:p1');
  await sweepsPassed();
  expect(log()).toContain('pane read wI:p1');
  expect(closes('wI:p1')).toBe(0);
});

test('an older run report does not license closing a newer session', async () => {
  // A ticket can have several runs — the board's own restart action closes one
  // session and starts another on the same worktree — so the run is chosen by
  // the pane in front of us, not by "some run of this ticket".
  const { wt, uid: oldUid } = shippedTicket('two runs', 'wJ:p1');
  storeReport(oldUid, 'built: by the OLD run\n');
  const newRun = spawnSync(TRACE, ['start', 'begin'], {
    encoding: 'utf8', cwd: REPO, env: env({ HERDR_PANE_ID: 'wJ:p2' }),
  });
  const newUid = newRun.stdout.trim().split('=')[1];
  // Attach the new run to the same ticket, the way a restart would.
  spawnSync('sqlite3', [join(HOME_DIR, 'factory.db'),
    `UPDATE runs SET ticket_id=(SELECT ticket_id FROM runs WHERE run_uid='${oldUid}') WHERE run_uid='${newUid}';`]);

  writeFileSync(READ_FILE, 'scraped from the NEW pane\n');
  session(wt, 'idle', 'wJ:p2');
  expect(await until(() => closes('wJ:p2') > 0)).toBe(true);

  // The new run got its own capture rather than riding on the old run's report.
  const arts = spawnSync(TRACE, ['artifacts', '--run', newUid!, '--json'], { encoding: 'utf8', cwd: REPO, env: env() });
  const rows = JSON.parse(arts.stdout);
  expect(rows.length).toBe(1);
  expect(rows[0].source).toBe('pane');
  // And the old run's own report is untouched.
  const old = spawnSync(TRACE, ['artifacts', '--run', oldUid, '--json'], { encoding: 'utf8', cwd: REPO, env: env() });
  expect(JSON.parse(old.stdout)[0].body).toContain('by the OLD run');
});

test('close_session_on_ship=false stops the closing but not the capture', async () => {
  const { wt, uid } = shippedTicket('opted out', 'wK:p1');
  storeReport(uid, 'built: the thing\n');
  writeFileSync(join(HOME_DIR, 'config'), 'close_session_on_ship=false\n');
  session(wt, 'idle', 'wK:p1');
  await sweepsPassed();
  expect(closes('wK:p1')).toBe(0);
  rmSync(join(HOME_DIR, 'config'), { force: true });
});
