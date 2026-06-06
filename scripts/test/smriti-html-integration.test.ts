// Integration tests for bin/smriti-html — U2a sessioned localhost transport.
// Spawns the real CLI (serve/await/render/stop) + drives the HTTP endpoints the
// browser would hit. Exercises the round-trip, revision-scoped accept,
// concurrent-session isolation, and idle self-termination (D2).

import { test, expect, beforeEach, afterEach } from 'bun:test';
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const REPO_ROOT = join(import.meta.dir, '..', '..');
const HTML = join(REPO_ROOT, 'bin', 'smriti-html');

let HOME_DIR: string;
let SPEC: string;
const openSessions: Array<{ id: string }> = [];

function specJson(revision: string): string {
  return JSON.stringify({
    title: 'Loop test',
    skill: 'plan-eng-review',
    session_id: 'placeholder',
    revision_id: revision,
    source_hash: 'deadbeef',
    sections: [{ id: 'arch', title: 'Architecture', cards: [{ id: 'f-001', title: 'A finding', body_md: 'body', default_decision: 'accept' }] }],
  });
}

// Run the CLI to completion, capturing stdout/stderr/exit code.
function sh(args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn('bun', [HTML, ...args], {
      env: { ...process.env, SMRITI_HOME: HOME_DIR },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '', e = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (e += d));
    child.on('exit', (code) => resolve({ code: code ?? -1, stdout: out, stderr: e }));
  });
}

// Short idle window in tests: any server a test fails to stop self-terminates
// quickly instead of dangling the runner for the production default.
async function serve(spec = SPEC): Promise<{ session_id: string; port: number }> {
  const r = await sh(['serve', spec, '--no-open', '--idle', '8000']);
  expect(r.code).toBe(0);
  const info = JSON.parse(r.stdout);
  openSessions.push({ id: info.session_id });
  return info;
}

function submit(port: number, body: Record<string, unknown>): Promise<Response> {
  return fetch(`http://127.0.0.1:${port}/submit`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function decisionPayload(session_id: string, revision_id: string, action = 'submit'): Record<string, unknown> {
  return { session_id, revision_id, source_hash: 'deadbeef', action, decisions: { 'f-001': { decision: 'accept' } } };
}

beforeEach(() => {
  HOME_DIR = mkdtempSync(join(tmpdir(), 'smriti-html-it-'));
  SPEC = join(HOME_DIR, 'spec.json');
  writeFileSync(SPEC, specJson('rev-1'));
  openSessions.length = 0;
});

afterEach(async () => {
  for (const s of openSessions) await sh(['stop', '--session', s.id]);
  rmSync(HOME_DIR, { recursive: true, force: true });
});

test('round-trip: serve → submit → await returns the payload → stop', async () => {
  const { session_id, port } = await serve();

  const awaiting = sh(['await', '--session', session_id, '--timeout', '8000']);
  await Bun.sleep(400);
  const res = await submit(port, decisionPayload(session_id, 'rev-1'));
  expect((await res.json()).status).toBe('accepted');

  const got = await awaiting;
  expect(got.code).toBe(0);
  const payload = JSON.parse(got.stdout);
  expect(payload.decisions['f-001'].decision).toBe('accept');

  const stopped = await sh(['stop', '--session', session_id]);
  expect(stopped.code).toBe(0);
}, 15000);

test('stale revision_id is rejected and await does not return it', async () => {
  const { session_id, port } = await serve();

  const awaiting = sh(['await', '--session', session_id, '--timeout', '1200']);
  await Bun.sleep(400);
  const res = await submit(port, decisionPayload(session_id, 'rev-OLD'));
  expect((await res.json()).status).toBe('stale_revision');

  // await should NOT have received the stale submission — it times out instead.
  const got = await awaiting;
  expect(got.code).toBe(5); // await-timeout
}, 15000);

test('render bumps the revision so await waits for the new round', async () => {
  const { session_id, port } = await serve();
  const spec2 = join(HOME_DIR, 'spec2.json');
  writeFileSync(spec2, specJson('rev-2'));

  const rendered = await sh(['render', '--session', session_id, spec2]);
  expect(rendered.code).toBe(0);
  expect(rendered.stdout.trim()).toBe('rev-2');

  // A submission for the OLD revision is now stale.
  const stale = await submit(port, decisionPayload(session_id, 'rev-1'));
  expect((await stale.json()).status).toBe('stale_revision');

  // A submission for the NEW revision is accepted and await returns it.
  const awaiting = sh(['await', '--session', session_id, '--timeout', '8000']);
  await Bun.sleep(400);
  await submit(port, decisionPayload(session_id, 'rev-2', 'finish'));
  const got = await awaiting;
  expect(got.code).toBe(0);
  expect(JSON.parse(got.stdout).action).toBe('finish');
}, 15000);

test('concurrent sessions are isolated', async () => {
  const a = await serve();
  const b = await serve();
  expect(a.session_id).not.toBe(b.session_id);

  const awaitA = sh(['await', '--session', a.session_id, '--timeout', '8000']);
  const awaitB = sh(['await', '--session', b.session_id, '--timeout', '1200']);
  await Bun.sleep(400);

  // Submit only to A.
  await submit(a.port, decisionPayload(a.session_id, 'rev-1'));

  const gotA = await awaitA;
  expect(gotA.code).toBe(0); // A received its submission
  const gotB = await awaitB;
  expect(gotB.code).toBe(5); // B saw nothing — timed out
}, 20000);

test('unknown session id is rejected by the server', async () => {
  const { port } = await serve();
  const res = await submit(port, decisionPayload('sess-bogus', 'rev-1'));
  expect((await res.json()).status).toBe('unknown_session');
}, 10000);

test('await against a nonexistent session exits 6 (no server)', async () => {
  const got = await sh(['await', '--session', 'sess-does-not-exist', '--timeout', '500']);
  expect(got.code).toBe(6);
}, 10000);

test('stop is idempotent', async () => {
  const { session_id } = await serve();
  const first = await sh(['stop', '--session', session_id]);
  expect(first.code).toBe(0);
  const second = await sh(['stop', '--session', session_id]);
  expect(second.code).toBe(0);
  expect(second.stdout).toContain('already stopped');
}, 15000);

test('D2: server self-terminates after the idle window', async () => {
  const r = await sh(['serve', SPEC, '--no-open', '--idle', '1200']);
  expect(r.code).toBe(0);
  const { session_id } = JSON.parse(r.stdout);
  openSessions.push({ id: session_id });

  await Bun.sleep(3000); // exceed the idle window with margin

  // The idle-exited server removed its statedir, so stop reports already-stopped.
  const stopped = await sh(['stop', '--session', session_id]);
  expect(stopped.stdout).toContain('already stopped');
}, 10000);
