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
  // Finished work, so the fold has something to unfold. Cancelled rather than
  // two shipped: they are the two halves of "completed" and the board must
  // treat them alike behind the fold while drawing them differently on a card.
  //
  // The id comes back out of the store by title rather than scraped from
  // stdout: a silently-wrong id here would fail later, inside the fold tests,
  // pointing at the fold rather than at this line.
  const idOf = (title: string) => {
    const r = run(TICKET, ['list', '--all', '--json'], appDir);
    if (r.status !== 0) throw new Error('ticket list failed: ' + r.stderr);
    const found = JSON.parse(r.stdout).find((t: any) => t.title === title);
    if (!found) throw new Error('fixture ticket never landed: ' + title);
    return String(found.id);
  };
  const must = (r: ReturnType<typeof run>, what: string) => {
    if (r.status !== 0) throw new Error(what + ' failed: ' + (r.stderr || r.stdout));
  };
  must(run(TICKET, ['add', 'the old importer', '--project', 'search-v2'], appDir), 'add shipped');
  must(run(TICKET, ['done', idOf('the old importer')], appDir), 'done');
  must(run(TICKET, ['add', 'a road not taken'], appDir), 'add cancelled');
  must(run(TICKET, ['cancel', idOf('a road not taken')], appDir), 'cancel');

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
});

// The margin (the app/project index down the left) and the fold (the count
// line that reveals finished work). Both are drawn fresh on every render and
// both remember things — which is where they can go wrong, so that is what
// these test rather than the markup.
describe('the margin', () => {
  it('lists the apps the board draws, ideas last, and never an empty repo row', async () => {
    if (!HAS_CHROMIUM) return;
    const { context, page, errors } = await open();
    try {
      await page.waitForSelector('.rail .ritem');
      const names = await page.locator('.rail .ritem .nm').allInnerTexts();
      expect(names).toEqual(['test-demo', 'ideas']);
      // Its projects hang under it, with the loose band beside them.
      const projects = await page.locator('.rail .rproj .nm').allInnerTexts();
      expect(projects).toContain('Search v2');
      expect(projects).toContain('loose');
      expect(errors).toEqual([]);
    } finally { await context.close(); }
  }, T);

  it('marks where you are, and a project in it opens that project', async () => {
    if (!HAS_CHROMIUM) return;
    const { context, page, errors } = await open();
    try {
      // Nothing is current on the board itself.
      expect(await page.locator('.rail .ritem.on').count()).toBe(0);

      await page.locator('.rail .rproj[data-proj]').first().click();
      await page.waitForFunction(() => location.hash.startsWith('#/p/'));
      await page.waitForSelector('.rail .rproj.on');
      expect(await page.locator('.rail .rproj.on .nm').innerText()).toBe('Search v2');
      // The margin is still there — that is the whole point of it.
      expect(await page.locator('.rail .ritem').count()).toBe(2);

      await page.locator('.rail .ritem[data-app]').first().click();
      await page.waitForFunction(() => location.hash === '#/r/test-demo');
      await page.waitForSelector('.rail .ritem.on');
      expect(await page.locator('.rail .ritem.on .nm').innerText()).toBe('test-demo');
      expect(errors).toEqual([]);
    } finally { await context.close(); }
  }, T);

  // Both jump rows navigate and THEN look for their target. Assigning the hash
  // updates it synchronously but fires hashchange as a later task, so a naive
  // lookup runs against the page you were still on and always misses.
  it('the ideas row reaches the board from a page you were already on', async () => {
    if (!HAS_CHROMIUM) return;
    const { context, page, errors } = await open();
    try {
      await page.goto(url.split('?')[0] + '#/r/test-demo', { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('.slab h1');

      await page.locator('.rail [data-ideas]').click();
      await page.waitForFunction(() => !location.hash || location.hash === '#');
      // It landed on the board AND found the band — a miss used to toast
      // "no ideas captured yet" while the ideas sat right there.
      await page.waitForSelector('.phead[data-app="(ideas)"]');
      expect(await page.locator('#toast.on').count()).toBe(0);
      expect(errors).toEqual([]);
    } finally { await context.close(); }
  }, T);

  it('collapses with b, and the choice survives a reload', async () => {
    if (!HAS_CHROMIUM) return;
    const { context, page, errors } = await open();
    try {
      const railWidth = () => page.evaluate(() =>
        getComputedStyle(document.querySelector('.rail')!).width);
      const wide = await railWidth();

      await page.keyboard.press('b');
      await page.waitForFunction(() => document.documentElement.dataset.rail === 'collapsed');
      const narrow = await railWidth();
      expect(parseFloat(narrow)).toBeLessThan(parseFloat(wide));
      // Collapsed is a sigil column, not nothing: the apps are still legible.
      expect(await page.locator('.rail .ritem').count()).toBe(2);

      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => (document.querySelector('#plots')?.children.length ?? 0) > 0);
      expect(await railWidth()).toBe(narrow);
      expect(errors).toEqual([]);
    } finally { await context.close(); }
  }, T);
});

describe('the fold', () => {
  it('hides finished work behind a count line that reveals it', async () => {
    if (!HAS_CHROMIUM) return;
    const { context, page, errors } = await open();
    try {
      await page.goto(url.split('?')[0] + '#/r/test-demo', { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('.histline');

      // Hidden by default — the line counts both halves of "completed".
      expect(await page.locator('.card.done').count()).toBe(0);
      // innerText comes back through text-transform:uppercase.
      const line = (await page.locator('.histline').innerText()).toLowerCase();
      expect(line).toContain('shipped 1');
      expect(line).toContain('cancelled 1');

      await page.locator('.histline').click();
      await page.waitForSelector('.card.done');
      const revealed = await page.locator('.card.done .t').allInnerTexts();
      expect(revealed).toContain('the old importer');
      expect(revealed).toContain('a road not taken');

      // And it folds back.
      await page.locator('.histline').click();
      await page.waitForFunction(() => document.querySelectorAll('.card.done').length === 0);
      expect(errors).toEqual([]);
    } finally { await context.close(); }
  }, T);

  it('stays open across a refresh — the board redraws itself every second', async () => {
    if (!HAS_CHROMIUM) return;
    const { context, page, errors } = await open();
    try {
      await page.goto(url.split('?')[0] + '#/r/test-demo', { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('.histline');
      await page.locator('.histline').click();
      await page.waitForSelector('.card.done');

      // r is the same refresh() an SSE 'changed' event drives, and it replaces
      // the view's html wholesale. A fold that lived in the DOM would shut here.
      await page.keyboard.press('r');
      await page.waitForTimeout(400);
      expect(await page.locator('.card.done').count()).toBeGreaterThan(0);
      expect(errors).toEqual([]);
    } finally { await context.close(); }
  }, T);

  it('draws no count line for a project with nothing finished', async () => {
    if (!HAS_CHROMIUM) return;
    const { context, page, errors } = await open();
    try {
      // Search v2 owns the shipped importer, so it HAS a line...
      await page.goto(url.split('?')[0] + '#/p/1', { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('.slab h1');
      expect(await page.locator('.histline').count()).toBe(1);
      // ...while the ideas band has nothing finished at all, so the board draws
      // no control there rather than a dead one.
      await page.goto(url.split('?')[0] + '#', { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('.phead[data-app="(ideas)"]');
      const ideasPlot = page.locator('.plot').filter({ has: page.locator('[data-app="(ideas)"]') });
      expect(await ideasPlot.locator('.histline').count()).toBe(0);
      expect(errors).toEqual([]);
    } finally { await context.close(); }
  }, T);

  // The regression this whole feature could most easily have shipped: the fold
  // inserts cards into the MIDDLE of the board's selection list, so restoring
  // the old numeric index put the highlight on a different ticket — and the
  // next d would have marked that one done.
  it('opening a fold above the selection does not move the selection', async () => {
    if (!HAS_CHROMIUM) return;
    const { context, page, errors } = await open();
    try {
      // Walk down to the app-less idea, which sorts AFTER test-demo's cards.
      for (let i = 0; i < 12; i++) {
        await page.keyboard.press('ArrowDown');
        const t = await page.locator('.card.sel .t').innerText().catch(() => '');
        if (t === 'an idea with no app') break;
      }
      expect(await page.locator('.card.sel .t').innerText()).toBe('an idea with no app');

      // test-demo's fold sits above it and adds a card when opened.
      await page.locator('.plot').filter({ has: page.locator('[data-app="test-demo"]') })
        .locator('.histline').click();
      await page.waitForSelector('.card.done');

      expect(await page.locator('.card.sel .t').innerText()).toBe('an idea with no app');
      expect(errors).toEqual([]);
    } finally { await context.close(); }
  }, T);

  it('h toggles every fold at once, and the choice survives a reload', async () => {
    if (!HAS_CHROMIUM) return;
    const { context, page, errors } = await open();
    try {
      await page.goto(url.split('?')[0] + '#/r/test-demo', { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('.histline');
      expect(await page.locator('.card.done').count()).toBe(0);

      await page.keyboard.press('h');
      await page.waitForSelector('.card.done');

      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForSelector('.card.done');
      expect(await page.locator('.card.done').count()).toBeGreaterThan(0);

      await page.keyboard.press('h');
      await page.waitForFunction(() => document.querySelectorAll('.card.done').length === 0);
      expect(errors).toEqual([]);
    } finally { await context.close(); }
  }, T);
});
