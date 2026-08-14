// Integration tests for the board's photo routes — the upload the paste handler
// sends, and the bytes it gets back.
//
// What is locked down here: that the declared content-type is NOT what decides
// the format (the bytes are), that an SVG never gets stored however it is
// labelled, that the ceiling is enforced, and that a photo comes back with
// headers safe enough to hang in a page that also renders the rest of the
// board. Auth is covered in board.test.ts and only spot-checked here.

import { test, expect, beforeAll, afterAll } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const REPO_ROOT = join(import.meta.dir, '..', '..');
const BOARD = join(REPO_ROOT, 'bin', 'smriti-board');
const PHOTO = join(REPO_ROOT, 'bin', 'smriti-photo');

let HOME_DIR = '';
let port = 0;
let jar = '';

// Real signatures. A fabricated header is the whole point of several of these
// tests, so the fixtures have to be genuine on the byte level.
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 73, 72, 68, 82, 1]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0xff, 0xd9]);
const GIF = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 1, 0, 1, 0, 0x80, 0, 0]);
const WEBP = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, 0x24, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x20,
]);
const SVG = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');

function cli(args: string[], env: Record<string, string> = {}) {
  return spawnSync('bun', [BOARD, ...args], {
    encoding: 'utf8',
    env: { ...process.env, SMRITI_HOME: HOME_DIR, SMRITI_BOARD_IDLE_MS: '60000', ...env },
  });
}
function photoCli(args: string[]) {
  return spawnSync(PHOTO, args, { encoding: 'utf8', env: { ...process.env, SMRITI_HOME: HOME_DIR } });
}
const base = () => `http://127.0.0.1:${port}`;
const withCookie = (extra: Record<string, string> = {}) => ({ headers: { cookie: jar, ...extra } });

function upload(body: Uint8Array, type = 'image/png') {
  return fetch(`${base()}/api/photos`, {
    method: 'POST',
    headers: { cookie: jar, 'content-type': type },
    body,
  });
}

beforeAll(async () => {
  HOME_DIR = mkdtempSync(join(tmpdir(), 'smriti-photos-'));
  const r = cli(['--url']);
  expect(r.status).toBe(0);
  const url = new URL(r.stdout.trim());
  port = Number(url.port);
  const ex = await fetch(`${base()}/?k=${url.searchParams.get('k')}`, { redirect: 'manual' });
  expect(ex.status).toBe(302);
  jar = (ex.headers.get('set-cookie') || '').split(';')[0];
});

afterAll(() => {
  cli(['stop']);
  rmSync(HOME_DIR, { recursive: true, force: true });
});

test('an upload without the cookie is refused', async () => {
  const r = await fetch(`${base()}/api/photos`, {
    method: 'POST', headers: { 'content-type': 'image/png' }, body: PNG,
  });
  expect(r.status).toBe(403);
});

test('a png round-trips: stored on the way in, served on the way out', async () => {
  const up = await upload(PNG);
  expect(up.status).toBe(200);
  const { id, mime } = await up.json();
  expect(id).toBeGreaterThan(0);
  expect(mime).toBe('image/png');

  const got = await fetch(`${base()}/api/photo/${id}`, withCookie());
  expect(got.status).toBe(200);
  expect(got.headers.get('content-type')).toBe('image/png');
  const back = new Uint8Array(await got.arrayBuffer());
  expect([...back]).toEqual([...PNG]);
});

test('the served photo carries the headers that make it safe to hang in the page', async () => {
  const { id } = await (await upload(JPEG, 'image/jpeg')).json();
  const got = await fetch(`${base()}/api/photo/${id}`, withCookie());
  expect(got.headers.get('x-content-type-options')).toBe('nosniff');
  expect(got.headers.get('content-security-policy')).toContain("default-src 'none'");
  // Cached forever, which is only sound because ids are never reused — see the
  // AUTOINCREMENT note in lib/factory-schema.sql, and the bats test that locks it.
  expect(got.headers.get('cache-control')).toContain('immutable');
  expect(got.headers.get('content-length')).toBe(String(JPEG.length));
});

test('the declared content-type does not decide the format — the bytes do', async () => {
  // A GIF announced as a PNG. Believing the header would file it wrong, and
  // believing the header is what would let an SVG through as an "image/png".
  const { id, mime } = await (await upload(GIF, 'image/png')).json();
  expect(mime).toBe('image/gif');
  const got = await fetch(`${base()}/api/photo/${id}`, withCookie());
  expect(got.headers.get('content-type')).toBe('image/gif');
});

test('gif and webp are stored too', async () => {
  expect((await (await upload(GIF)).json()).mime).toBe('image/gif');
  expect((await (await upload(WEBP)).json()).mime).toBe('image/webp');
});

test('an svg is refused however it is labelled', async () => {
  for (const type of ['image/svg+xml', 'image/png', 'text/plain']) {
    const r = await upload(SVG, type);
    expect(r.status).toBe(415);
    expect((await r.json()).error).toContain('not a photo');
  }
});

test('the same image uploaded twice is one stored photo', async () => {
  const a = await (await upload(PNG)).json();
  const b = await (await upload(PNG)).json();
  expect(b.id).toBe(a.id);
});

test('an empty upload is refused', async () => {
  const r = await upload(new Uint8Array(0));
  expect(r.status).toBe(400);
});

test('a photo that does not exist is a clean 404', async () => {
  const r = await fetch(`${base()}/api/photo/99999`, withCookie());
  expect(r.status).toBe(404);
});

test('a non-numeric photo id is not a route at all', async () => {
  const r = await fetch(`${base()}/api/photo/abc`, withCookie());
  expect(r.status).toBe(404);
});

test('a deleted photo stops being served', async () => {
  const { id } = await (await upload(GIF)).json();
  expect(photoCli(['rm', String(id)]).status).toBe(0);
  const r = await fetch(`${base()}/api/photo/${id}`, withCookie());
  expect(r.status).toBe(404);
});

test('the description renderer turns a stored reference into an image', async () => {
  const { id } = await (await upload(PNG)).json();
  const r = await fetch(`${base()}/api/render`, {
    method: 'POST',
    headers: { cookie: jar, 'content-type': 'application/json' },
    body: JSON.stringify({ md: `look: ![the bug](smriti://photo/${id})` }),
  });
  const { html } = await r.json();
  expect(html).toContain(`<img src="/api/photo/${id}"`);
  expect(html).toContain('alt="the bug"');
  // Wrapped, so clicking opens the full size rather than the editor.
  expect(html).toContain(`<a href="/api/photo/${id}"`);
});

test('the renderer refuses every image that is not a stored photo', async () => {
  const cases = [
    '![x](https://evil.example/tracker.png)',
    '![x](http://evil.example/tracker.png)',
    '![x](smriti://photo/abc)',
    '![x](smriti://other/1)',
    '![x](data:image/svg+xml;base64,PHN2Zz4=)',
  ];
  for (const md of cases) {
    const r = await fetch(`${base()}/api/render`, {
      method: 'POST',
      headers: { cookie: jar, 'content-type': 'application/json' },
      body: JSON.stringify({ md }),
    });
    const { html } = await r.json();
    expect(html).not.toContain('<img');
  }
});

test('caption text cannot break out of the alt attribute', async () => {
  const r = await fetch(`${base()}/api/render`, {
    method: 'POST',
    headers: { cookie: jar, 'content-type': 'application/json' },
    body: JSON.stringify({ md: '![" onerror="alert(1)](smriti://photo/1)' }),
  });
  const { html } = await r.json();
  expect(html).not.toContain('onerror="alert');
  expect(html).toContain('&quot;');
});

test('the upload ceiling is enforced, and by the server rather than the client', async () => {
  // A fresh server with a tiny ceiling: the running one would need a 10 MB body
  // to cross its own, which is a slow way to prove a comparison.
  const home2 = mkdtempSync(join(tmpdir(), 'smriti-photos-cap-'));
  const r = spawnSync('bun', [BOARD, '--url'], {
    encoding: 'utf8',
    env: { ...process.env, SMRITI_HOME: home2, SMRITI_BOARD_IDLE_MS: '60000', SMRITI_PHOTO_MAX_BYTES: '8' },
  });
  try {
    expect(r.status).toBe(0);
    const url = new URL(r.stdout.trim());
    const p2 = Number(url.port);
    const ex = await fetch(`http://127.0.0.1:${p2}/?k=${url.searchParams.get('k')}`, { redirect: 'manual' });
    const jar2 = (ex.headers.get('set-cookie') || '').split(';')[0];

    const big = await fetch(`http://127.0.0.1:${p2}/api/photos`, {
      method: 'POST', headers: { cookie: jar2, 'content-type': 'image/png' }, body: PNG,
    });
    expect(big.status).toBe(413);
  } finally {
    spawnSync('bun', [BOARD, 'stop'], { encoding: 'utf8', env: { ...process.env, SMRITI_HOME: home2 } });
    rmSync(home2, { recursive: true, force: true });
  }
});
