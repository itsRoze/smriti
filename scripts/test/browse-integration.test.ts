// Live Playwright integration tests for bin/smriti-browse — Stories 3, 4, 5.
//
// Story 3: Playwright minor bump silently breaks ARIA snapshot capture.
//   → Serve a fixture, audit, assert aria.txt contains expected text.
//
// Story 4: Dev server isn't running.
//   → Audit a port nothing's listening on, assert exit 2 with a navigation error.
//
// Story 5: Stale auth produces lying screenshots.
//   → Fixture 302s to /login when no cookie present; audit without storage state;
//     assert exit 3 (auth_stale) and audit_status="auth_stale" in audit.json.
//
// These tests are gated on Chromium availability — if `bunx playwright install
// chromium` hasn't been run, they skip with a clear note rather than fail.

import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const REPO_ROOT = join(import.meta.dir, '..', '..');
const BROWSE = join(REPO_ROOT, 'bin', 'smriti-browse');

// ─── Chromium availability gate ─────────────────────────────────────────────

async function chromiumAvailable(): Promise<boolean> {
  try {
    const { chromium } = await import('playwright');
    const browser = await chromium.launch({ headless: true });
    await browser.close();
    return true;
  } catch {
    return false;
  }
}

let HAS_CHROMIUM = false;

beforeAll(async () => {
  HAS_CHROMIUM = await chromiumAvailable();
  if (!HAS_CHROMIUM) {
    console.warn(
      '\n[browse-integration] Chromium not installed; live integration tests will skip.\n' +
      '  Run: bun bin/smriti-browse install\n',
    );
  }
});

// ─── Fixture HTTP server ────────────────────────────────────────────────────

let server: ReturnType<typeof Bun.serve> | null = null;
let baseUrl = '';

beforeAll(() => {
  server = Bun.serve({
    port: 0, // random port
    fetch(req) {
      const url = new URL(req.url);

      // /dashboard — returns full page; redirects to /login if "session" cookie missing.
      // Used by Stories 3 and 5.
      if (url.pathname === '/dashboard') {
        const cookie = req.headers.get('cookie') ?? '';
        if (!cookie.includes('session=')) {
          return new Response(null, {
            status: 302,
            headers: { Location: '/login' },
          });
        }
        return new Response(
          `<!doctype html><html><head><title>Dashboard</title></head>
          <body>
            <h1>Welcome back</h1>
            <main>
              <button>Save changes</button>
              <a href="/settings">Settings</a>
            </main>
          </body></html>`,
          { headers: { 'Content-Type': 'text/html' } },
        );
      }

      if (url.pathname === '/login') {
        return new Response(
          `<!doctype html><html><head><title>Sign in</title></head>
          <body><h1>Sign in</h1><form><input type=email><input type=password><button>Sign in</button></form></body></html>`,
          { headers: { 'Content-Type': 'text/html' } },
        );
      }

      // /public — Story 3: simple page to check ARIA capture works.
      if (url.pathname === '/public') {
        return new Response(
          `<!doctype html><html><head><title>Public Page</title></head>
          <body>
            <h1 id=hero>Hello world</h1>
            <button aria-label="primary action">Go</button>
          </body></html>`,
          { headers: { 'Content-Type': 'text/html' } },
        );
      }

      return new Response('not found', { status: 404 });
    },
  });
  baseUrl = `http://127.0.0.1:${server.port}`;
});

afterAll(() => {
  if (server) server.stop(true);
});

// ─── Helpers ────────────────────────────────────────────────────────────────

// Async spawn — `spawnSync` blocks the test process's event loop, which
// would prevent the in-process fixture HTTP server from accepting connections
// while smriti-browse is running. Use a Promise wrapper instead.
//
// Capture stdio through file descriptors written to /dev/null instead of pipes —
// piping to the test process can stall the child if the test process's event
// loop is doing other work (e.g. handling the fixture server's HTTP requests)
// and doesn't drain the pipe buffer fast enough.
function runBrowse(args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise(resolve => {
    const child = spawn('bun', [BROWSE, ...args], { stdio: 'ignore' });
    child.on('close', code => resolve({ code: code ?? -1, stdout: '', stderr: '' }));
    child.on('error', e => resolve({ code: -1, stdout: '', stderr: String(e) }));
  });
}

function freshOutDir(): string {
  const dir = join(tmpdir(), `smriti-browse-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  return dir;
}

function readAuditJson(outDir: string, subdir: string) {
  const path = join(outDir, subdir, 'audit.json');
  return JSON.parse(readFileSync(path, 'utf-8'));
}

function readIndexJson(outDir: string) {
  return JSON.parse(readFileSync(join(outDir, 'index.json'), 'utf-8'));
}

// ─── Story 3: ARIA capture works ────────────────────────────────────────────

describe('Story 3 — ARIA snapshot capture (Playwright API drift)', () => {
  it('captures aria.txt with the page heading and button', async () => {
    if (!HAS_CHROMIUM) return;
    const out = freshOutDir();
    try {
      // /public has no auth gate
      const url = `${baseUrl}/public`;
      const r = await runBrowse(['audit', url, '--out', out, '--allow-remote']);
      expect(r.code).toBe(0);

      const idx = readIndexJson(out);
      expect(idx.runs.length).toBe(1);
      expect(idx.runs[0].audit_status).toBe('ok');

      const audit = readAuditJson(out, idx.runs[0].subdir);
      expect(audit.audit_status).toBe('ok');
      expect(audit.exit_code).toBe(0);
      expect(audit.artifacts.aria_snapshot).toBe('aria.txt');

      const aria = readFileSync(join(out, idx.runs[0].subdir, 'aria.txt'), 'utf-8');
      // Playwright's ARIA snapshot is YAML-ish; assert key text appears.
      expect(aria).toContain('Hello world');
      expect(aria.toLowerCase()).toContain('button');

      // Untrusted observations include final-url and page-title.
      const kinds = audit.untrusted_observations.map((o: any) => o.kind);
      expect(kinds).toContain('final-url');
      expect(kinds).toContain('page-title');

      // Screenshots produced.
      expect(audit.artifacts.screenshots.length).toBeGreaterThan(0);
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  }, 60_000);
});

// ─── Story 4: dev server not running ────────────────────────────────────────

describe('Story 4 — dev server missing', () => {
  it('exits non-zero with a navigation error in the audit JSON', async () => {
    if (!HAS_CHROMIUM) return;
    const out = freshOutDir();
    try {
      // Use a port we know is closed. 1 is privileged & always closed for non-root.
      // To stay portable, pick a high port not in use.
      const closedPort = 1; // root-only; non-root will get connection refused.
      const url = `http://127.0.0.1:${closedPort}/`;
      const r = await runBrowse(['audit', url, '--out', out]);

      // Worst exit code is 2 (runtime/browser error).
      expect(r.code).toBe(2);

      const idx = readIndexJson(out);
      expect(idx.runs[0].audit_status).toBe('failed');
      expect(idx.runs[0].exit_code).toBe(2);

      const audit = readAuditJson(out, idx.runs[0].subdir);
      const navErrors = audit.untrusted_observations.filter((o: any) => o.kind === 'nav-error');
      expect(navErrors.length).toBeGreaterThan(0);

      // No screenshots, no aria capture on nav failure.
      expect(audit.artifacts.screenshots.length).toBe(0);
      expect(audit.artifacts.aria_snapshot).toBeNull();
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  }, 60_000);
});

// ─── Story 5: stale auth detection ──────────────────────────────────────────

describe('Story 5 — stale auth produces exit 3', () => {
  it('detects login redirect and exits 3 (auth_stale)', async () => {
    if (!HAS_CHROMIUM) return;
    const out = freshOutDir();
    try {
      // /dashboard redirects to /login when no session cookie present.
      // Auditing without --storage simulates expired/missing auth.
      const url = `${baseUrl}/dashboard`;
      const r = await runBrowse(['audit', url, '--out', out, '--allow-remote']);
      expect(r.code).toBe(3);

      const idx = readIndexJson(out);
      expect(idx.runs[0].audit_status).toBe('auth_stale');
      expect(idx.runs[0].exit_code).toBe(3);

      const audit = readAuditJson(out, idx.runs[0].subdir);
      expect(audit.audit_status).toBe('auth_stale');
      expect(audit.notes.some((n: string) => n.includes('stale-auth'))).toBe(true);

      // Should NOT have screenshotted the login page (the lying-screenshot bug).
      expect(audit.artifacts.screenshots.length).toBe(0);
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  }, 60_000);
});

// ─── Multi-URL: worst-of exit code ──────────────────────────────────────────

describe('Multi-URL audit', () => {
  it('returns worst exit code across runs and writes per-URL subdirs', async () => {
    if (!HAS_CHROMIUM) return;
    const out = freshOutDir();
    try {
      const okUrl = `${baseUrl}/public`;
      const staleUrl = `${baseUrl}/dashboard`;
      const r = await runBrowse(['audit', okUrl, staleUrl, '--out', out, '--allow-remote']);

      // Worst is 3 (auth_stale).
      expect(r.code).toBe(3);

      const idx = readIndexJson(out);
      expect(idx.runs.length).toBe(2);
      expect(idx.worst_exit_code).toBe(3);
      expect(existsSync(join(out, idx.runs[0].subdir, 'audit.json'))).toBe(true);
      expect(existsSync(join(out, idx.runs[1].subdir, 'audit.json'))).toBe(true);
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  }, 90_000);
});
