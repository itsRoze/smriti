// Live browser tests for the board's routing and selection.
//
// The board is one 1100-line template string with no build step, so nothing
// type-checks it and nothing else exercises the parts that only exist at
// runtime: the hash router, the three-level grouping, and — the subtle one —
// which view OWNS the keyboard. `flat` and `sel` used to be board-shaped
// globals; if a page does not rebuild them, `s`/`d`/`⏎` act on whatever was
// selected back on the board, which is a data-loss-shaped bug rather than a
// cosmetic one.
//
// Gated on Chromium the same way browse-integration.test.ts is: a fresh clone
// without `smriti browse install` skips these with a note rather than failing.

import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const REPO_ROOT = join(import.meta.dir, '..', '..');
const BOARD = join(REPO_ROOT, 'bin', 'smriti-board');
const TICKET = join(REPO_ROOT, 'bin', 'smriti-ticket');
const PROJECT = join(REPO_ROOT, 'bin', 'smriti-project');
const REPO = join(REPO_ROOT, 'bin', 'smriti-repo');
const SLUG = join(REPO_ROOT, 'bin', 'smriti-slug');
const TRACE = join(REPO_ROOT, 'bin', 'smriti-trace');
const HTMLBIN = join(REPO_ROOT, 'bin', 'smriti-html');

let HAS_CHROMIUM = false;
let HOME_DIR = '';
let appDir = '';
let url = '';
// One browser for the file, a fresh page per test: launching Chromium per test
// costs seconds each and is the whole reason these used to time out.
let browser: import('playwright').Browser | null = null;

// Chromium launch + networkidle is comfortably over bun's 5s default.
const T = 30_000;

async function chromiumAvailable(): Promise<boolean> {
  try {
    const { chromium } = await import('playwright');
    const b = await chromium.launch({ headless: true });
    await b.close();
    return true;
  } catch {
    return false;
  }
}

const run = (bin: string, args: string[], cwd?: string) =>
  spawnSync(bin, args, { encoding: 'utf8', cwd, env: { ...process.env, SMRITI_HOME: HOME_DIR } });

beforeAll(async () => {
  HAS_CHROMIUM = await chromiumAvailable();
  if (!HAS_CHROMIUM) {
    console.warn('\n  ⚠ Chromium not installed — board UI tests skipped. Run: smriti browse install\n');
    return;
  }

  HOME_DIR = mkdtempSync(join(tmpdir(), 'smriti-boardui-'));
  appDir = join(HOME_DIR, 'app');
  mkdirSync(appDir, { recursive: true });
  spawnSync('git', ['init', '-q', '-b', 'main'], { cwd: appDir });
  spawnSync('git', ['remote', 'add', 'origin', 'https://github.com/test/demo.git'], { cwd: appDir });
  writeFileSync(join(appDir, 'PROJECT.md'), '# Project: demo\n\nthe **overview**');
  run(SLUG, ['--print'], appDir);

  // One app with a project and a loose ticket, plus an idea belonging to
  // nothing — the three states the board has to draw differently.
  run(PROJECT, ['add', 'Search v2'], appDir);
  run(TICKET, ['add', 'index the corpus', '--project', 'search-v2', '--ready'], appDir);
  run(TICKET, ['add', 'a one-off bug', '--ready'], appDir);
  run(TICKET, ['add', 'an idea with no app', '--repo', '-'], appDir);

  const r = spawnSync('bun', [BOARD, '--url'], {
    encoding: 'utf8',
    env: { ...process.env, SMRITI_HOME: HOME_DIR, SMRITI_BOARD_IDLE_MS: '120000' },
  });
  url = r.stdout.trim();

  const { chromium } = await import('playwright');
  browser = await chromium.launch({ headless: true });
}, 60_000);

afterAll(async () => {
  if (!HAS_CHROMIUM) return;
  await browser?.close();
  spawnSync('bun', [BOARD, 'stop'], { env: { ...process.env, SMRITI_HOME: HOME_DIR } });
  rmSync(HOME_DIR, { recursive: true, force: true });
});

async function open(hash = '') {
  const context = await browser!.newContext();
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  // The ?k= exchange must happen on this context's first load; the fragment
  // rides through the 302 to /.
  //
  // 'domcontentloaded', never 'networkidle': the board holds an SSE stream open
  // for live updates, so the network is never idle and that wait never returns.
  await page.goto(url + hash, { waitUntil: 'domcontentloaded' });
  // Everything is drawn from a fetch, so the DOM is empty for a beat after
  // load. Pressing a key before the first render just no-ops against an empty
  // selection list and then waits forever for something to be selected.
  await page.waitForFunction(() => (document.querySelector('#plots')?.children.length ?? 0) > 0);
  return { context, page, errors };
}

describe('board UI', () => {
  it('draws apps, their projects, loose tickets and app-less ideas', async () => {
    if (!HAS_CHROMIUM) return;
    const { context, page, errors } = await open();
    try {
      await page.waitForSelector('.phead');
      const apps = await page.locator('.phead .pname').allInnerTexts();
      expect(apps).toContain('test-demo');
      expect(apps).toContain('ideas');
      // The project sub-heading, and the "loose" band beside it.
      const subs = await page.locator('.sub').allInnerTexts();
      expect(subs.join(' ')).toContain('Search v2');
      expect(subs.join(' ')).toContain('loose in this app');
      expect(errors).toEqual([]);
    } finally { await context.close(); }
  }, T);

  it('clicking an app heading opens its page, and back returns', async () => {
    if (!HAS_CHROMIUM) return;
    const { context, page, errors } = await open();
    try {
      await page.locator('.phead[data-app="test-demo"]').click();
      await page.waitForSelector('.slab');
      expect(page.url()).toContain('#/r/test-demo');
      expect(await page.locator('.slab h1').innerText()).toBe('test-demo');
      // PROJECT.md is read off disk and rendered in place.
      await page.waitForSelector('.docpane h1');
      expect(await page.locator('.docpane').innerText()).toContain('overview');

      await page.locator('[data-back]').click();
      await page.waitForSelector('.phead');
      expect(page.url()).not.toContain('#/r/');
      expect(errors).toEqual([]);
    } finally { await context.close(); }
  }, T);

  it('a project page links up to its app', async () => {
    if (!HAS_CHROMIUM) return;
    const { context, page, errors } = await open();
    try {
      await page.locator('.sub[data-proj]').first().click();
      await page.waitForSelector('.slab');
      expect(page.url()).toContain('#/p/');
      expect(await page.locator('.slab h1').innerText()).toBe('Search v2');
      // Its ticket is here; the loose one is not.
      const cards = await page.locator('.card .t').allInnerTexts();
      expect(cards).toContain('index the corpus');
      expect(cards).not.toContain('a one-off bug');

      // Back goes UP to the app, not out to the board.
      await page.locator('[data-back]').click();
      await page.waitForSelector('.slab h1');
      expect(page.url()).toContain('#/r/test-demo');
      expect(errors).toEqual([]);
    } finally { await context.close(); }
  }, T);

  it('a deep link survives a reload', async () => {
    if (!HAS_CHROMIUM) return;
    const { context, page, errors } = await open();
    try {
      await page.goto(url.split('?')[0] + '#/r/test-demo', { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('.slab h1');
      expect(await page.locator('.slab h1').innerText()).toBe('test-demo');
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForSelector('.slab h1');
      expect(await page.locator('.slab h1').innerText()).toBe('test-demo');
      expect(errors).toEqual([]);
    } finally { await context.close(); }
  }, T);

  it('selection is owned by the view — arrow keys never reach a page you left', async () => {
    if (!HAS_CHROMIUM) return;
    const { context, page, errors } = await open();
    try {
      // Leave the board with something selected. `.sel`, not `.card.sel`: herdr
      // agent names are machine-global (`t<id>`), so on a developer box a real
      // session can match a fixture ticket by id and push it into the waiting
      // band, where the selected row is an .item. Production has one store, so
      // ids never collide there — but the test must not depend on it.
      await page.keyboard.press('ArrowDown');
      await page.waitForSelector('.sel');

      await page.locator('.sub[data-proj]').first().click();
      await page.waitForSelector('.slab');
      // Arriving clears it. This is the invariant: a stale `sel` surviving the
      // navigation is exactly how s/d/⏎ end up acting on someone else's row.
      expect(await page.locator('.card.sel').count()).toBe(0);

      // And moving now selects a card this page actually drew.
      await page.keyboard.press('ArrowDown');
      await page.waitForSelector('.card.sel');
      expect(await page.locator('.card.sel .t').innerText()).toBe('index the corpus');
      expect(errors).toEqual([]);
    } finally { await context.close(); }
  }, T);

  it('esc walks back up a level rather than doing nothing', async () => {
    if (!HAS_CHROMIUM) return;
    const { context, page, errors } = await open();
    try {
      await page.goto(url.split('?')[0] + '#/p/1', { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('.slab');

      // Waits are DOM-based, not URL-based: the doc tabs exist only on an app
      // page and .phead only on the board, so each assert is anchored to
      // something the render actually produced.
      await page.keyboard.press('Escape');
      await page.waitForSelector('[data-tab]');
      expect(page.url()).toContain('#/r/test-demo');

      await page.keyboard.press('Escape');
      await page.waitForSelector('.phead');
      expect(page.url()).not.toContain('#/r/');
      expect(errors).toEqual([]);
    } finally { await context.close(); }
  }, T);

  it('an app description edits in place and persists', async () => {
    if (!HAS_CHROMIUM) return;
    const { context, page, errors } = await open();
    try {
      await page.goto(url.split('?')[0] + '#/r/test-demo', { waitUntil: 'domcontentloaded' });
      // #pagedesc, not #desc: the detail overlay owns #desc/#descedit, and the
      // two used to collide — the overlay's editor operated on the page's
      // description and saved the app's text into a ticket body.
      await page.locator('#pagedesc').click();
      await page.locator('#pagedescedit').fill('a scratch app for tests');
      await page.locator('#pagedescedit').press('Meta+Enter');
      await page.waitForSelector('#pagedesc:has-text("a scratch app for tests")');
      // ...and it is really in the store, not just on screen.
      const shown = spawnSync(REPO, ['show', 'test-demo', '--json'], {
        encoding: 'utf8', env: { ...process.env, SMRITI_HOME: HOME_DIR },
      });
      expect(JSON.parse(shown.stdout).description).toBe('a scratch app for tests');
      expect(errors).toEqual([]);
    } finally { await context.close(); }
  }, T);

  it('the DESIGN.md tab shows its empty state rather than an error', async () => {
    if (!HAS_CHROMIUM) return;
    const { context, page, errors } = await open();
    try {
      await page.goto(url.split('?')[0] + '#/r/test-demo', { waitUntil: 'domcontentloaded' });
      await page.locator('[data-tab="DESIGN"]').click();
      await page.waitForSelector('.docpane .nothing');
      const text = await page.locator('.docpane').innerText();
      expect(text).toContain('no DESIGN.md');
      expect(text).toContain('/design-consultation');
      expect(errors).toEqual([]);
    } finally { await context.close(); }
  });

  // ── the click-through into a live gate (T8) ────────────────────────────
  // A link inside a row that is itself clickable is the kind of thing that
  // regresses silently: you click "open the plan" and get the ticket overlay.

  it('a waiting row links to the live plan, and the link does not open the overlay', async () => {
    if (!HAS_CHROMIUM) return;
    // A real served gate, so the board resolves a real port.
    const specPath = join(HOME_DIR, 'gate.json');
    writeFileSync(specPath, JSON.stringify({
      title: 'Plan', skill: 'begin', session_id: 'pending', revision_id: 'rev-1', source_hash: 'h',
      sections: [{ id: 's', title: 'S', cards: [{ id: 'c1', title: 't', body_md: 'b' }] }],
    }));
    const served = spawnSync('bun', [HTMLBIN, 'serve', specPath, '--no-open', '--no-trace'], {
      encoding: 'utf8', env: { ...process.env, SMRITI_HOME: HOME_DIR },
    });
    const { session_id: sid, port } = JSON.parse(served.stdout) as { session_id: string; port: number };

    const tickets = JSON.parse(run(TICKET, ['list', '--all', '--json'], appDir).stdout) as
      { id: number; title: string }[];
    const tid = tickets.find((t) => t.title === 'index the corpus')!.id;
    const uid = run(TRACE, ['start', 'begin', '--ticket', String(tid)], appDir).stdout.trim().split('=')[1];
    run(TRACE, ['emit', 'approve', 'awaiting', '--run', uid, '--html-session', sid], appDir);

    const { context, page, errors } = await open();
    try {
      const link = page.locator('.wait .planlink');
      await link.waitFor();
      expect(await link.getAttribute('href')).toBe(`http://127.0.0.1:${port}/`);
      expect(await link.getAttribute('target')).toBe('_blank');

      // The row underneath opens the ticket overlay. The link must not.
      await link.click({ modifiers: ['Alt'] }); // Alt-click: no navigation, event still fires
      await page.waitForTimeout(250);
      expect(await page.locator('#detv.on').count()).toBe(0);

      // ...while clicking the row itself still does open it.
      await page.locator('.wait .item').first().click();
      await page.waitForSelector('#detv.on');
      expect(errors).toEqual([]);
    } finally {
      await context.close();
      run(TRACE, ['end', '--run', uid], appDir);
      spawnSync('bun', [HTMLBIN, 'stop', '--session', sid], {
        encoding: 'utf8', env: { ...process.env, SMRITI_HOME: HOME_DIR },
      });
    }
  }, T);

  it('a waiting row with no live gate shows no link at all', async () => {
    if (!HAS_CHROMIUM) return;
    const tickets = JSON.parse(run(TICKET, ['list', '--all', '--json'], appDir).stdout) as
      { id: number; title: string }[];
    const tid = tickets.find((t) => t.title === 'a one-off bug')!.id;
    const uid = run(TRACE, ['start', 'begin', '--ticket', String(tid)], appDir).stdout.trim().split('=')[1];
    // Parked at a gate, but pointing at a session that was never served.
    run(TRACE, ['emit', 'approve', 'awaiting', '--run', uid, '--html-session', 'sess-ghost'], appDir);

    const { context, page, errors } = await open();
    try {
      await page.waitForSelector('.wait .item');
      expect(await page.locator('.wait .planlink').count()).toBe(0);
      expect(errors).toEqual([]);
    } finally {
      await context.close();
      run(TRACE, ['end', '--run', uid], appDir);
    }
  }, T);
});
