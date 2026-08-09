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

let HAS_CHROMIUM = false;
let HOME_DIR = '';
let appDir = '';
let url = '';
// One browser for the file, a fresh page per test: launching Chromium per test
// costs seconds each and is the whole reason these used to time out.
let browser: import('playwright').Browser | null = null;

// Chromium launch + networkidle is comfortably over bun's 5s default.
const T = 30_000;

// The fixture body for the markdown tests. Kept verbatim so the round-trip
// assertion can compare against the exact source the CLI was handed.
const MD_BODY = [
  '## why this exists',
  '',
  'the first paragraph.',
  '',
  'a second one, after a blank line.',
  '',
  '- one',
  '- two',
  '',
  '| state | what |',
  '|---|---|',
  '| raw | source |',
  '',
  'see [the docs](https://example.com/docs) for more.',
].join('\n');

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
  // A body written the way the real backlog is written: sections, a list, a
  // table, a link. Before this rendered it arrived as one unbroken run.
  run(TICKET, ['add', 'a ticket with a real body', '--ready', '--body', MD_BODY], appDir);

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

  // ── markdown descriptions ────────────────────────────────────────────
  // The renderer runs server-side, so these prove the whole round trip:
  // raw text painted first, /api/render called, rendered markup swapped in.

  // The fixture adds four tickets in order, so the one with a body is #4.
  const MD_TICKET = 4;

  async function openBodyTicket(page: import('playwright').Page) {
    await page.locator('.card[data-tid="' + MD_TICKET + '"]').click();
    await page.waitForSelector('#detv.on');
    // .raw → .md is the swap landing. Waiting on the class rather than a
    // timeout keeps this honest about what it is testing.
    await page.waitForSelector('#desc.md');
  }

  it('a ticket body renders as markdown rather than a wall of text', async () => {
    if (!HAS_CHROMIUM) return;
    const { context, page, errors } = await open();
    try {
      await openBodyTicket(page);
      const desc = page.locator('#desc');
      expect(await desc.locator('h2').innerText()).toBe('why this exists');
      expect(await desc.locator('p').count()).toBeGreaterThanOrEqual(3);
      expect(await desc.locator('li').count()).toBe(2);
      expect(await desc.locator('.tablewrap table th').first().innerText()).toBe('state');
      expect(await desc.locator('a').getAttribute('href')).toBe('https://example.com/docs');
      // The source is still the source: the editor is a textarea over it.
      expect(await page.locator('#descedit').inputValue()).toBe(MD_BODY);
      expect(errors).toEqual([]);
    } finally { await context.close(); }
  }, T);

  it('the detail view shows fields, not a dot-separated sentence', async () => {
    if (!HAS_CHROMIUM) return;
    const { context, page, errors } = await open();
    try {
      await openBodyTicket(page);
      expect(await page.locator('#detbody .eyebrow').innerText()).toBe('#' + MD_TICKET);
      // Rows are emitted whether or not they are filled, so the block does not
      // reflow between tickets — this one has no project and no branch.
      // innerText is post-CSS, and the labels are small caps by text-transform.
      const labels = await page.locator('.fields dt').allInnerTexts();
      expect(labels).toEqual(['APP', 'PROJECT', 'STATUS', 'BRANCH']);
      expect(await page.locator('.fields .stamp').innerText()).toBe('READY');
      expect(await page.locator('.fields dd.empty').count()).toBe(2);
      // The document count is gone; the paper trail below says it in full.
      // #detbody, not .detail — the help veil reuses that class for its heading.
      expect(await page.locator('#detbody').innerText()).not.toContain('document');
      expect(errors).toEqual([]);
    } finally { await context.close(); }
  }, T);

  it('a link in the body opens instead of dropping you into the editor', async () => {
    if (!HAS_CHROMIUM) return;
    const { context, page, errors } = await open();
    try {
      await openBodyTicket(page);
      // The renderer marks links target="_blank", so a real click would open a
      // tab. What matters here is only that the editor did NOT open.
      const link = page.locator('#desc a');
      await link.evaluate((a: HTMLAnchorElement) => a.removeAttribute('target'));
      await page.evaluate(() => {
        document.querySelector('#desc a')!.addEventListener('click', (e) => e.preventDefault());
      });
      await link.click();
      expect(await page.locator('#descedit.on').count()).toBe(0);

      // ...but clicking the prose still edits, which is the other half.
      await page.locator('#desc p').first().click();
      await page.waitForSelector('#descedit.on');
      expect(errors).toEqual([]);
    } finally { await context.close(); }
  }, T);

  it('e opens the editor, and the markdown round-trips byte for byte', async () => {
    if (!HAS_CHROMIUM) return;
    const { context, page, errors } = await open();
    try {
      await openBodyTicket(page);
      // The board had no keyboard path into an editor at all before this.
      await page.keyboard.press('e');
      await page.waitForSelector('#descedit.on');
      expect(await page.locator('#descedit').inputValue()).toBe(MD_BODY);

      // Save unchanged, then read the store: a rendered body must not become
      // the thing that gets written back.
      await page.locator('#descedit').press('Meta+Enter');
      await page.waitForSelector('#desc.md');
      const shown = spawnSync(TICKET, ['show', String(MD_TICKET), '--json'], {
        encoding: 'utf8', env: { ...process.env, SMRITI_HOME: HOME_DIR },
      });
      expect(JSON.parse(shown.stdout).ticket.body).toBe(MD_BODY);
      expect(errors).toEqual([]);
    } finally { await context.close(); }
  }, T);

  it('an edit after a cancelled edit still saves', async () => {
    if (!HAS_CHROMIUM) return;
    const { context, page, errors } = await open();
    try {
      await openBodyTicket(page);
      // Escape ABANDONS by clearing the blur handler. Opening a second editor
      // has to re-arm it, or the next edit blurs into nothing and is lost with
      // no error — the worst shape a bug can have on a description box.
      await page.keyboard.press('e');
      await page.waitForSelector('#descedit.on');
      await page.locator('#descedit').press('Escape');
      await page.waitForSelector('#descedit.on', { state: 'hidden' });

      await page.keyboard.press('e');
      await page.waitForSelector('#descedit.on');
      await page.locator('#descedit').fill('rewritten after a cancel');
      await page.locator('#descedit').press('Meta+Enter');

      await page.waitForSelector('#desc:has-text("rewritten after a cancel")');
      const shown = spawnSync(TICKET, ['show', String(MD_TICKET), '--json'], {
        encoding: 'utf8', env: { ...process.env, SMRITI_HOME: HOME_DIR },
      });
      expect(JSON.parse(shown.stdout).ticket.body).toBe('rewritten after a cancel');

      // Put it back, so the tests after this one still see the fixture body.
      run(TICKET, ['edit', String(MD_TICKET), '--body', MD_BODY], appDir);
      expect(errors).toEqual([]);
    } finally { await context.close(); }
  }, T);

  it('with rendering unavailable the body still keeps its line breaks', async () => {
    if (!HAS_CHROMIUM) return;
    // No errors assertion here, unlike every other test in this file: aborting
    // the request is the point, and the browser logs the failed fetch itself.
    const { context, page } = await open();
    try {
      await page.route('**/api/render', (route) => route.abort());
      await page.locator('.card[data-tid="' + MD_TICKET + '"]').click();
      await page.waitForSelector('#detv.on');
      // The point of painting raw first: a render that never lands degrades to
      // readable source, not a blank box — and crucially not to the one
      // unbroken run this ticket existed to fix.
      const desc = page.locator('#desc.raw');
      await desc.waitFor();
      const text = await desc.innerText();
      expect(text).toContain('the first paragraph.');
      expect(text).toContain('a second one, after a blank line.');
      expect(text.split('\n').length).toBeGreaterThan(5);
      expect(await page.locator('#desc.md').count()).toBe(0);
    } finally { await context.close(); }
  }, T);

  it('a render that lands after you start editing is discarded', async () => {
    if (!HAS_CHROMIUM) return;
    const { context, page, errors } = await open();
    try {
      // Hold the render open, so the response is guaranteed to arrive after
      // the editor is up. This is the race the generation guard exists for:
      // without it the stale HTML swaps in underneath a live textarea.
      let release: () => void = () => {};
      const gate = new Promise<void>((r) => { release = r; });
      await page.route('**/api/render', async (route) => { await gate; await route.continue(); });

      await page.locator('.card[data-tid="' + MD_TICKET + '"]').click();
      await page.waitForSelector('#desc.raw');
      await page.keyboard.press('e');
      await page.waitForSelector('#descedit.on');

      release();
      await page.waitForTimeout(300);

      expect(await page.locator('#descedit.on').count()).toBe(1);
      expect(await page.locator('#desc.md').count()).toBe(0);
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
});
