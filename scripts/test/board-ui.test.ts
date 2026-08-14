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

// Fixture ids come back out of the store by title, never from position in it.
// Two tickets added ahead of another one's fixture is all it takes to renumber
// everything after it, and a hard-coded id then fails inside whichever test
// happens to use it rather than at the line that moved.
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

// Wait for the STORE to say something, rather than reading it the instant the
// DOM does.
//
// Writes are optimistic now: the value is painted the moment you commit it and
// the request goes out behind you. So a DOM wait no longer proves the row was
// written — it proves it was accepted, which is the whole point — and a store
// read taken on that signal races the request it is meant to be checking.
//
// This still asserts persistence, and still fails if the write never lands. It
// just stops assuming the two happen in the same tick.
async function untilStore<T>(read: () => T, want: T, what: string, ms = 4000): Promise<T> {
  const deadline = Date.now() + ms;
  let last: T;
  do {
    last = read();
    if (last === want) return last;
    await new Promise((r) => setTimeout(r, 50));
  } while (Date.now() < deadline);
  throw new Error(what + ': store never became ' + JSON.stringify(want) +
    ' (last saw ' + JSON.stringify(last) + ')');
}
const ticketRow = (id: number | string) =>
  (JSON.parse(run(TICKET, ['list', '--all', '--json'], appDir).stdout) as any[])
    .find((x) => String(x.id) === String(id)) || {};
// Assigned in beforeAll — the describe body runs at collection time, before
// any fixture exists.
let MD_TICKET = 0;

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
  must(run(TICKET, ['add', 'the old importer', '--project', 'search-v2'], appDir), 'add shipped');
  must(run(TICKET, ['done', idOf('the old importer')], appDir), 'done');
  must(run(TICKET, ['add', 'a road not taken'], appDir), 'add cancelled');
  must(run(TICKET, ['cancel', idOf('a road not taken')], appDir), 'cancel');
  // A body written the way the real backlog is written: sections, a list, a
  // table, a link. Before this rendered it arrived as one unbroken run.
  must(run(TICKET, ['add', 'a ticket with a real body', '--ready', '--body', MD_BODY], appDir), 'add body');
  MD_TICKET = Number(idOf('a ticket with a real body'));

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
      // One id pair across all three descriptions now. There used to be a
      // second, because the ticket lived in an overlay, and the two collided —
      // the overlay's editor operated on the page's description and saved the
      // app's text into a ticket body.
      await page.locator('#pagedesc').click();
      await page.locator('#pagedescedit').fill('a scratch app for tests');
      await page.locator('#pagedescedit').press('Meta+Enter');
      await page.waitForSelector('#pagedesc:has-text("a scratch app for tests")');
      // ...and it is really in the store, not just on screen.
      await untilStore(() => JSON.parse(spawnSync(REPO, ['show', 'test-demo', '--json'], {
        encoding: 'utf8', env: { ...process.env, SMRITI_HOME: HOME_DIR },
      }).stdout).description, 'a scratch app for tests', 'app description');
      expect(errors).toEqual([]);
    } finally { await context.close(); }
  }, T);

  // ── markdown descriptions ────────────────────────────────────────────
  // The renderer runs server-side, so these prove the whole round trip:
  // raw text painted first, /api/render called, rendered markup swapped in.

  // The fixture adds four tickets in order, so the one with a body is #4.

  async function openBodyTicket(page: import('playwright').Page) {
    await page.locator('.card[data-tid="' + MD_TICKET + '"]').click();
    // .stub is the ticket page's own furniture — it exists on no other view,
    // so waiting on it proves the route landed rather than merely that
    // something rendered.
    await page.waitForSelector('.stub');
    // .raw → .md is the swap landing. Waiting on the class rather than a
    // timeout keeps this honest about what it is testing.
    await page.waitForSelector('#pagedesc.md');
  }

  it('a ticket body renders as markdown rather than a wall of text', async () => {
    if (!HAS_CHROMIUM) return;
    const { context, page, errors } = await open();
    try {
      await openBodyTicket(page);
      const desc = page.locator('#pagedesc');
      expect(await desc.locator('h2').innerText()).toBe('why this exists');
      expect(await desc.locator('p').count()).toBeGreaterThanOrEqual(3);
      expect(await desc.locator('li').count()).toBe(2);
      expect(await desc.locator('.tablewrap table th').first().innerText()).toBe('state');
      expect(await desc.locator('a').getAttribute('href')).toBe('https://example.com/docs');
      // The source is still the source: the editor is a textarea over it.
      expect(await page.locator('#pagedescedit').inputValue()).toBe(MD_BODY);
      expect(errors).toEqual([]);
    } finally { await context.close(); }
  }, T);

  it('the ticket page heads the card with its number and files it in the stub', async () => {
    if (!HAS_CHROMIUM) return;
    const { context, page, errors } = await open();
    try {
      await openBodyTicket(page);
      // The number IS the monogram — the tile the app and project pages give
      // their initials — which is why there is no separate eyebrow any more.
      expect(await page.locator('.slab .bigsig').innerText()).toBe('#' + MD_TICKET);
      expect(await page.locator('.slab h1').innerText()).toBe('a ticket with a real body');
      // Never started, so the mono line says so rather than showing a branch.
      expect(await page.locator('.slab .path').innerText()).toContain('not started yet');

      // Status is a struck stamp at the head of the stub, in the class its card
      // wears on the board. innerText is post-CSS: the label is small caps by
      // text-transform.
      const stamp = page.locator('.stub .stamp.big');
      expect(await stamp.innerText()).toBe('READY');
      expect(await stamp.getAttribute('class')).toContain('s-ready');

      // Filed under: app, project and what it waits on — all emitted whether or
      // not they are filled, because each row is also the control that fills it
      // and a ticket with no blockers is exactly when you go to add one.
      // "blocks" is the exception: it is not editable from this end, so it
      // appears only when something is actually waiting.
      const labels = await page.locator('.stub .f .k2').allInnerTexts();
      expect(labels).toEqual(['APP', 'PROJECT', 'BLOCKED BY']);
      // Two blanks: no project, and nothing blocking it.
      expect(await page.locator('.stub .f .v.empty').count()).toBe(2);
      // The value carries a ↗ that opens the app page — the click that used to
      // be the whole row, moved aside so the row itself can edit.
      expect(await page.locator('.stub .f .v').first().innerText()).toContain('test-demo');
      // All three rows are writable, and each names the key that opens its picker.
      expect(await page.locator('.stub .f[data-field="app"]').getAttribute('data-k')).toBe('a');
      expect(await page.locator('.stub .f[data-field="project"]').getAttribute('data-k')).toBe('f');
      // w for "waits on", not b — b is already the margin toggle.
      expect(await page.locator('.stub .f[data-field="deps"]').getAttribute('data-k')).toBe('w');
      expect(await page.locator('.stub .head[data-field="status"]').getAttribute('data-k')).toBe('x');
      expect(errors).toEqual([]);
    } finally { await context.close(); }
  }, T);

  it('a ticket has an address that survives a reload, and a bad one goes home', async () => {
    if (!HAS_CHROMIUM) return;
    const { context, page, errors } = await open();
    try {
      // The whole point of the ticket: somewhere to send, bookmark and reopen.
      await page.goto(url.split('?')[0] + '#/t/' + MD_TICKET, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('.stub');
      expect(await page.locator('.slab h1').innerText()).toBe('a ticket with a real body');
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForSelector('.stub');
      expect(await page.locator('.slab h1').innerText()).toBe('a ticket with a real body');

      // A link that outlived its ticket lands on the board, not on a blank
      // page — the same answer a missing project already gives.
      await page.goto(url.split('?')[0] + '#/t/999999', { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('.phead');
      expect(await page.locator('.stub').count()).toBe(0);
      expect(errors).toEqual([]);
    } finally { await context.close(); }
  }, T);

  // No errors assertion in this one: aborting the request is the point, and
  // the browser logs the failed fetch itself.
  it('a ticket page is its own selection — d acts on the ticket it drew', async () => {
    if (!HAS_CHROMIUM) return;
    const { context, page } = await open();
    try {
      const filed = idOf('index the corpus');
      await page.goto(url.split('?')[0] + '#/t/' + filed, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('.stub');

      // There is no list to move within, so the page IS the row. Blocked rather
      // than allowed to land: marking it done for real would move the fixture
      // out from under the tests that count what is finished.
      await page.route('**/api/tickets/*/done', (route) => route.abort());
      const fired = page.waitForRequest((r) => /\/api\/tickets\/\d+\/done$/.test(r.url()));
      await page.keyboard.press('d');
      expect(new URL((await fired).url()).pathname).toBe('/api/tickets/' + filed + '/done');
    } finally { await context.close(); }
  }, T);

  // The page being its own selection has a sharp edge: selectedTicket() is
  // never null there, so anything that reaches the global handler acts on a
  // real ticket. Both of these cut a git worktree and spawn an agent session
  // when they regress, which is why they are pinned rather than reasoned about.
  it('keyboard-activating a stub button does not also start the ticket', async () => {
    if (!HAS_CHROMIUM) return;
    const { context, page, errors } = await open();
    try {
      let starts = 0;
      await page.route('**/api/tickets/*/start', (route) => { starts++; route.abort(); });
      await page.goto(url.split('?')[0] + '#/t/' + MD_TICKET, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('.stub');

      // The two-press confirm is a disposition you reach by keyboard like any
      // other, and pressing it must not ALSO run the global Enter branch.
      const del = page.locator('.stub [data-act="delete"]');
      await del.focus();
      await page.keyboard.press('Enter');
      await page.waitForSelector('.stub [data-act="delete"]:has-text("really delete?")');
      expect(starts).toBe(0);
      expect(errors).toEqual([]);
    } finally { await context.close(); }
  }, T);

  it('typing into a picker does not start or finish the ticket', async () => {
    if (!HAS_CHROMIUM) return;
    // The re-file <select> this replaced was typed into — s jumped to an
    // option beginning with s, and those keystrokes reached the board's own
    // s and d. The picker's query input is the control that took its place.
    const { context, page, errors } = await open();
    try {
      let hits = 0;
      await page.route('**/api/tickets/*/start', (route) => { hits++; route.abort(); });
      await page.route('**/api/tickets/*/done', (route) => { hits++; route.abort(); });
      await page.goto(url.split('?')[0] + '#/t/' + idOf('index the corpus'), { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('.stub .f[data-field="project"]');

      await page.locator('.stub .f[data-field="project"]').click();
      await page.waitForSelector('#palv.on');
      await page.keyboard.press('s');
      await page.keyboard.press('d');
      await page.waitForTimeout(400);
      expect(hits).toBe(0);
      expect(await page.locator('#palv.on').count()).toBe(1);
      expect(errors).toEqual([]);
    } finally { await context.close(); }
  }, T);

  it('a redraw does not disarm the delete confirm', async () => {
    if (!HAS_CHROMIUM) return;
    const { context, page, errors } = await open();
    try {
      await page.goto(url.split('?')[0] + '#/t/' + MD_TICKET, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('.stub');
      await page.locator('.stub [data-act="delete"]').click();
      await page.waitForSelector('.stub [data-act="delete"]:has-text("really delete?")');

      // The redraw an SSE tick would have caused. The armed state used to live
      // on the button, so this silently reverted the label and delete could
      // never be completed on a ticket whose agent was running.
      await page.evaluate(() => window.dispatchEvent(new HashChangeEvent('hashchange')));
      await page.waitForTimeout(200);
      expect(await page.locator('.stub [data-act="delete"]').innerText()).toBe('really delete?');
      expect(errors).toEqual([]);
    } finally { await context.close(); }
  }, T);

  it('esc climbs the whole ladder — ticket, project, app, board', async () => {
    if (!HAS_CHROMIUM) return;
    const { context, page, errors } = await open();
    try {
      // A filed ticket, so every rung is exercised. Waits are DOM-anchored
      // rather than URL-anchored — .stub exists only on a ticket page, doc tabs
      // only on an app page, .phead only on the board — so each assert is
      // pinned to something a render actually produced.
      await page.goto(url.split('?')[0] + '#/t/' + idOf('index the corpus'), { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('.stub');

      await page.keyboard.press('Escape');
      await page.waitForSelector('.stub', { state: 'detached' });
      expect(page.url()).toContain('#/p/');

      await page.keyboard.press('Escape');
      await page.waitForSelector('[data-tab]');
      expect(page.url()).toContain('#/r/test-demo');

      await page.keyboard.press('Escape');
      await page.waitForSelector('.phead');
      expect(page.url()).not.toContain('#/r/');
      expect(errors).toEqual([]);
    } finally { await context.close(); }
  }, T);

  it('the margin marks where a ticket lives, not nothing at all', async () => {
    if (!HAS_CHROMIUM) return;
    const { context, page, errors } = await open();
    try {
      // The index used to know only about the two views that ARE an app or a
      // project, so it went blank on the one view you are deepest inside.
      await page.goto(url.split('?')[0] + '#/t/' + idOf('index the corpus'), { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('.stub');
      await page.waitForSelector('.rail .ritem.on');
      expect(await page.locator('.rail .ritem.on .nm').innerText()).toBe('test-demo');
      expect(await page.locator('.rail .rproj.on .nm').innerText()).toBe('Search v2');
      expect(errors).toEqual([]);
    } finally { await context.close(); }
  }, T);

  it('a redraw of a ticket page costs no trace requests', async () => {
    if (!HAS_CHROMIUM) return;
    const { context, page, errors } = await open();
    try {
      // The overlay was built once; a page is redrawn on every SSE tick, and
      // each of these spawns sqlite behind the server. Both rounds are cached
      // — including the "no runs" answer, or a ticket that has never run would
      // re-ask forever.
      await page.goto(url.split('?')[0] + '#/t/' + MD_TICKET, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('.runs .nothing');
      let traceCalls = 0;
      page.on('request', (req) => {
        if (/\/api\/runs\?|\/api\/run\//.test(req.url())) traceCalls++;
      });
      // Force the redraws the SSE tick would have caused.
      await page.evaluate(() => { for (let i = 0; i < 5; i++) window.dispatchEvent(new HashChangeEvent('hashchange')); });
      await page.waitForTimeout(250);
      expect(traceCalls).toBe(0);
      expect(await page.locator('.runs .nothing').count()).toBe(1);
      expect(errors).toEqual([]);
    } finally { await context.close(); }
  }, T);

  // ── the stub's fields as a control surface (T20) ───────────────────────

  const ticketPage = async (page: import('playwright').Page, id: string | number) => {
    await page.goto(url.split('?')[0] + '#/t/' + id, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.stub');
  };

  it('a captured idea with no app is filed from the board, app and all', async () => {
    if (!HAS_CHROMIUM) return;
    // The motivating case: `smriti ticket add` works from anywhere, so an idea
    // arrives with no app and no project and could only be filed from a
    // terminal. Picking a project settles the app too, because a project
    // belongs to exactly one.
    const id = idOf('an idea with no app');
    const { context, page, errors } = await open();
    try {
      await ticketPage(page, id);
      expect(await page.locator('.stub .f[data-field="app"]').innerText()).toContain('no app yet');

      await page.locator('.stub .f[data-field="project"]').click();
      await page.waitForSelector('#palv.on');
      // It has no app, so every app's projects are on offer and grouped by app.
      expect(await page.locator('#palopts .grp').count()).toBeGreaterThan(0);
      await page.locator('#palopts .o:has-text("Search v2")').click();

      await page.waitForSelector('.stub .f[data-field="project"]:has-text("Search v2")');
      // ...and it is really in the store, not just on screen.
      await untilStore(() => ticketRow(id).project_ref, 'search-v2', 'project_ref');
      expect(ticketRow(id).repo_slug).toBe('test-demo');
      expect(errors).toEqual([]);
    } finally {
      run(TICKET, ['edit', id, '--repo', '-'], appDir);
      await context.close();
    }
  }, T);

  it('the status picker offers all six, cancelled included, and lands', async () => {
    if (!HAS_CHROMIUM) return;
    // The ticket that asked for this said five; the CLI has always taken six,
    // and only its usage string disagreed.
    const { context, page, errors } = await open();
    try {
      await ticketPage(page, MD_TICKET);
      await page.keyboard.press('x');
      await page.waitForSelector('#palv.on');
      const rows = await page.locator('#palopts .o span:first-child').allInnerTexts();
      expect(rows).toEqual(['idea', 'ready', 'building', 'in review', 'shipped', 'cancelled']);
      // The row you are on says so instead of repeating the word.
      expect(await page.locator('#palopts .o:has-text("ready") .r').first().innerText()).toBe('current');

      await page.locator('#palopts .o:has-text("cancelled")').click();
      await page.waitForSelector('.stub .stamp.big:has-text("CANCELLED")');
      await untilStore(() => ticketRow(MD_TICKET).status, 'cancelled', 'status');
      expect(errors).toEqual([]);
    } finally {
      run(TICKET, ['status', String(MD_TICKET), 'ready'], appDir);
      await context.close();
    }
  }, T);

  it('a started ticket says what holds its app instead of offering a picker', async () => {
    if (!HAS_CHROMIUM) return;
    // Its worktree lives inside the app's tree, so bin/smriti-ticket refuses
    // the move. A picker that failed on submit would be the wrong half of that.
    // Its own fixture, torn down here, so the shared board is not left with an
    // extra in_progress ticket for every test after this one.
    spawnSync('git', ['add', '-A'], { cwd: appDir });
    spawnSync('git', ['-c', 'user.email=t@smriti.local', '-c', 'user.name=t',
      'commit', '-q', '-m', 'seed'], { cwd: appDir });
    must(run(TICKET, ['add', 'held by its worktree', '--ready'], appDir), 'add held');
    const held = idOf('held by its worktree');
    const cleanup = () => {
      const wt = JSON.parse(run(TICKET, ['list', '--all', '--json'], appDir).stdout)
        .find((t: any) => String(t.id) === held)?.worktree_path;
      if (wt) spawnSync('git', ['worktree', 'remove', '--force', wt], { cwd: appDir });
      run(TICKET, ['rm', held, '--yes'], appDir);
    };
    let context: import('playwright').BrowserContext | null = null;
    try {
      must(run(TICKET, ['start', held], appDir), 'start held');
      const opened = await open();
      context = opened.context;
      const { page, errors } = opened;
      await ticketPage(page, held);

      // No control on the app row, and the branch named as the reason.
      expect(await page.locator('.stub .f[data-field="app"]').count()).toBe(0);
      expect(await page.locator('.stub .f .held').innerText()).toContain('t' + held + '-');
      // The key does nothing either — the lock is not just a missing target.
      await page.keyboard.press('a');
      expect(await page.locator('#palv.on').count()).toBe(0);
      // ...while the project row stays editable: only the APP cannot move,
      // because only the APP is where the worktree lives.
      expect(await page.locator('.stub .f[data-field="project"]').count()).toBe(1);
      expect(errors).toEqual([]);
    } finally {
      await context?.close();
      cleanup();
    }
  }, T);

  it('a modifier key belongs to the browser, not the board', async () => {
    if (!HAS_CHROMIUM) return;
    // a / f / x preventDefault, so without this guard the ticket page — the
    // one surface with prose on it — swallowed find and select-all.
    const { context, page, errors } = await open();
    try {
      await ticketPage(page, MD_TICKET);
      for (const combo of ['Meta+f', 'Meta+a', 'Meta+x', 'Control+f']) {
        await page.keyboard.press(combo);
        expect(await page.locator('#palv.on').count()).toBe(0);
      }
      // ...and the bare key still works.
      await page.keyboard.press('f');
      await page.waitForSelector('#palv.on');
      expect(errors).toEqual([]);
    } finally { await context.close(); }
  }, T);

  it('finished work cannot be started or re-shipped from the keyboard', async () => {
    if (!HAS_CHROMIUM) return;
    // The buttons carried these guards and the buttons are gone; a ticket page
    // is its own selection, so the keys always resolve — the guards moved onto
    // the actions.
    const shipped = idOf('the old importer');
    const { context, page } = await open();
    try {
      await ticketPage(page, shipped);
      const before = JSON.parse(run(TICKET, ['list', '--all', '--json'], appDir).stdout)
        .find((t: any) => String(t.id) === shipped).updated_at;
      await page.keyboard.press('Enter');   // would cut a worktree
      await page.keyboard.press('d');       // would re-ship
      await page.waitForTimeout(500);
      const after = JSON.parse(run(TICKET, ['list', '--all', '--json'], appDir).stdout)
        .find((t: any) => String(t.id) === shipped);
      expect(after.updated_at).toBe(before);
      expect(after.branch).toBeNull();
    } finally { await context.close(); }
  }, T);

  it('a refusal reads as a sentence, not as raw JSON', async () => {
    if (!HAS_CHROMIUM) return;
    // The whole chain: CLI die() → stderr → {error} → api() → toast. Before
    // this the toast showed the transport around the sentence, not the
    // sentence: could not save: {"error":"smriti-ticket: no ticket #7"}.
    must(run(TICKET, ['add', 'about to vanish', '--ready'], appDir), 'add doomed');
    const doomed = idOf('about to vanish');
    const { context, page } = await open();
    try {
      await ticketPage(page, doomed);
      // Open the picker BEFORE deleting: its rows captured the id when they
      // were built, so the click below does not depend on the page still
      // knowing about a ticket the store has dropped.
      await page.keyboard.press('x');
      await page.waitForSelector('#palv.on');
      run(TICKET, ['rm', doomed, '--yes'], appDir);
      await page.locator('#palopts .o:has-text("shipped")').click();

      await page.waitForSelector('#toast.on');
      const said = await page.locator('#toast').innerText();
      expect(said).toContain('no ticket #' + doomed);
      expect(said).not.toContain('{');
      expect(said).not.toContain('smriti-ticket:');
      // errors is not asserted empty here: the 500 this deliberately provokes
      // is logged by the browser as a failed resource load.
    } finally {
      run(TICKET, ['rm', doomed, '--yes'], appDir);
      await context.close();
    }
  }, T);

  it('a link in the body opens instead of dropping you into the editor', async () => {
    if (!HAS_CHROMIUM) return;
    const { context, page, errors } = await open();
    try {
      await openBodyTicket(page);
      // The renderer marks links target="_blank", so a real click would open a
      // tab. What matters here is only that the editor did NOT open.
      const link = page.locator('#pagedesc a');
      await link.evaluate((a: HTMLAnchorElement) => a.removeAttribute('target'));
      await page.evaluate(() => {
        document.querySelector('#pagedesc a')!.addEventListener('click', (e) => e.preventDefault());
      });
      await link.click();
      expect(await page.locator('#pagedescedit.on').count()).toBe(0);

      // ...but clicking the prose still edits, which is the other half.
      await page.locator('#pagedesc p').first().click();
      await page.waitForSelector('#pagedescedit.on');
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
      await page.waitForSelector('#pagedescedit.on');
      expect(await page.locator('#pagedescedit').inputValue()).toBe(MD_BODY);

      // Saving an unchanged body must not write at all. Counting the PATCH is
      // the only honest way to assert that — reading the store back would pass
      // whether or not a request was sent, since the value is identical either
      // way. (The changed-body write-back is covered by the cancel test.)
      let patches = 0;
      page.on('request', (req) => {
        if (req.method() === 'PATCH' && req.url().includes('/api/tickets/')) patches++;
      });
      await page.locator('#pagedescedit').press('Meta+Enter');
      await page.waitForSelector('#pagedesc.md');
      expect(patches).toBe(0);
      expect(errors).toEqual([]);
    } finally { await context.close(); }
  }, T);

  it('Enter on a focused description edits it and does not start the ticket', async () => {
    if (!HAS_CHROMIUM) return;
    const { context, page, errors } = await open();
    try {
      // Counted AND blocked: if the guard regresses this fires for real, and
      // starting a ticket cuts a git worktree and spawns an agent session.
      let starts = 0;
      await page.route('**/api/tickets/*/start', (route) => { starts++; route.abort(); });

      // Reached by keyboard, because that is the shape the guard is about: on
      // a ticket page the page IS the selection, so the global Enter means
      // "start this ticket" — and pressing Enter in the body must not also.
      await page.keyboard.press('ArrowDown');
      await page.waitForSelector('.sel');
      await page.keyboard.press('Enter');
      await page.waitForSelector('.stub');

      // The description is tabbable, and Escape from its editor focuses it, so
      // the element handler has to stop the event rather than merely
      // preventDefault it.
      await page.keyboard.press('e');
      await page.waitForSelector('#pagedescedit.on');
      await page.locator('#pagedescedit').press('Escape');
      await page.waitForSelector('#pagedescedit.on', { state: 'hidden' });
      expect(await page.evaluate(() => document.activeElement?.id)).toBe('pagedesc');

      await page.keyboard.press('Enter');
      await page.waitForSelector('#pagedescedit.on');
      expect(starts).toBe(0);
      expect(errors).toEqual([]);
    } finally { await context.close(); }
  }, T);

  it('the editor opens tall enough to show the body it holds', async () => {
    if (!HAS_CHROMIUM) return;
    const { context, page, errors } = await open();
    try {
      await openBodyTicket(page);
      await page.keyboard.press('e');
      await page.waitForSelector('#pagedescedit.on');
      // The property worth pinning is not a pixel count, it is "you can see
      // what you are typing": no inner scrollbar, so the whole body is visible
      // without scrolling inside a six-line letterbox.
      const { clientH, scrollH, capped } = await page.evaluate(() => {
        const ta = document.querySelector('#pagedescedit') as HTMLTextAreaElement;
        return { clientH: ta.clientHeight, scrollH: ta.scrollHeight, capped: Math.round(window.innerHeight * 0.6) };
      });
      expect(scrollH).toBeLessThanOrEqual(clientH + 2);
      // ...but never past the cap, or the save buttons below leave the screen.
      expect(clientH).toBeLessThanOrEqual(capped);
      expect(errors).toEqual([]);
    } finally { await context.close(); }
  }, T);

  it('an app description renders markdown too, not just a ticket body', async () => {
    if (!HAS_CHROMIUM) return;
    const { context, page, errors } = await open();
    try {
      // The page surfaces re-derive their source from S rather than from what
      // descBox was handed, so rendering there is a genuinely separate path
      // from the ticket body — and it is two of the ticket's three surfaces.
      run(REPO, ['edit', 'test-demo', '--description', '## the app\n\n- one\n- two'], appDir);
      await page.goto(url.split('?')[0] + '#/r/test-demo', { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('#pagedesc.md');
      expect(await page.locator('#pagedesc h2').innerText()).toBe('the app');
      expect(await page.locator('#pagedesc li').count()).toBe(2);
      // The editor still holds the source, not the rendered markup.
      expect(await page.locator('#pagedescedit').inputValue()).toBe('## the app\n\n- one\n- two');
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
      await page.waitForSelector('#pagedescedit.on');
      await page.locator('#pagedescedit').press('Escape');
      await page.waitForSelector('#pagedescedit.on', { state: 'hidden' });

      await page.keyboard.press('e');
      await page.waitForSelector('#pagedescedit.on');
      await page.locator('#pagedescedit').fill('rewritten after a cancel');
      await page.locator('#pagedescedit').press('Meta+Enter');

      await page.waitForSelector('#pagedesc:has-text("rewritten after a cancel")');
      // Polled, not read once — and the restore below is why it MATTERS here
      // rather than merely being tidier. An optimistic save paints before it
      // sends, so reading the store on the DOM's signal can beat the request;
      // restoring the fixture on that reading let the in-flight write land
      // afterwards and overwrite it, and the next two tests then opened a
      // ticket whose body was this test's string.
      await untilStore(() => JSON.parse(spawnSync(TICKET, ['show', String(MD_TICKET), '--json'], {
        encoding: 'utf8', env: { ...process.env, SMRITI_HOME: HOME_DIR },
      }).stdout).ticket.body, 'rewritten after a cancel', 'ticket body');

      // Put it back, so the tests after this one still see the fixture body.
      run(TICKET, ['edit', String(MD_TICKET), '--body', MD_BODY], appDir);
      expect(errors).toEqual([]);
    } finally { await context.close(); }
  }, T);

  it('a render that comes back empty does not blank the description', async () => {
    if (!HAS_CHROMIUM) return;
    const { context, page, errors } = await open();
    try {
      // renderMarkdown returns '' for a whitespace-only source, which is
      // reachable via `smriti ticket add --body`. Swapping that in would leave
      // an empty strip with no text and no ghost — and, with .raw removed, no
      // pre-wrap either. The box has to keep what it already had.
      await page.route('**/api/render', (route) =>
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ html: '' }) }));
      // Armed BEFORE the click: the render fires as the page draws, so
      // registering the wait afterwards races the request and hangs.
      const rendered = page.waitForResponse((r) => r.url().includes('/api/render'));
      await page.locator('.card[data-tid="' + MD_TICKET + '"]').click();
      await page.waitForSelector('.stub');
      await rendered;
      // A settle only AFTER a confirmed response. The negative assertion below
      // needs the client's continuation to have run; what it must not do is
      // bet on the response arriving at all, which is what a bare sleep does.
      await page.waitForTimeout(100);

      expect(await page.locator('#pagedesc.raw').count()).toBe(1);
      expect(await page.locator('#pagedesc').innerText()).toContain('the first paragraph.');
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
      await page.waitForSelector('.stub');
      // The point of painting raw first: a render that never lands degrades to
      // readable source, not a blank box — and crucially not to the one
      // unbroken run this ticket existed to fix.
      const desc = page.locator('#pagedesc.raw');
      await desc.waitFor();
      const text = await desc.innerText();
      expect(text).toContain('the first paragraph.');
      expect(text).toContain('a second one, after a blank line.');
      expect(text.split('\n').length).toBeGreaterThan(5);
      expect(await page.locator('#pagedesc.md').count()).toBe(0);
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
      await page.waitForSelector('#pagedesc.raw');
      await page.keyboard.press('e');
      await page.waitForSelector('#pagedescedit.on');

      // Wait on the RESPONSE, not a sleep. A timeout here would let the test
      // pass because the render never arrived — i.e. it would stay green with
      // the guard deleted, which is the one thing it exists to catch.
      const landed = page.waitForResponse((r) => r.url().includes('/api/render'));
      release();
      await landed;
      // Settle only after the response is known to have arrived — see the
      // empty-render test for why that is not the same as sleeping and hoping.
      await page.waitForTimeout(100);

      expect(await page.locator('#pagedescedit.on').count()).toBe(1);
      expect(await page.locator('#pagedesc.md').count()).toBe(0);
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
  // regresses silently: you click "open the plan" and land on the ticket.

  it('a waiting row links to the live plan, and the link does not open the ticket', async () => {
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

      // The row underneath navigates to the ticket. The link must not.
      await link.click({ modifiers: ['Alt'] }); // Alt-click: no navigation, event still fires
      await page.waitForTimeout(250);
      expect(await page.locator('.stub').count()).toBe(0);

      // ...while clicking the row itself still does open it.
      await page.locator('.wait .item').first().click();
      await page.waitForSelector('.stub');

      // The ticket page carries the same click-through, chosen by an explicit
      // "awaiting with a live URL" predicate rather than by whichever run a
      // bare find() happens to reach first. It ranks with start rather than
      // with the dispositions, because an open gate IS the primary action.
      const btn = page.locator('.stub .acts a:has-text("open the plan")');
      await btn.waitFor();
      expect(await btn.getAttribute('href')).toBe(`http://127.0.0.1:${port}/`);
      expect(errors).toEqual([]);
    } finally {
      await context.close();
      run(TRACE, ['end', '--run', uid], appDir);
      spawnSync('bun', [HTMLBIN, 'stop', '--session', sid], {
        encoding: 'utf8', env: { ...process.env, SMRITI_HOME: HOME_DIR },
      });
    }
  }, T);

  // ── the band only claims what it can prove ─────────────────────────────
  //
  // "Waiting on you" was one uncorroborated predicate — runs.status === 'awaiting'
  // — over a column written by a process that can die. Four finished tickets sat
  // in it for days, counters climbing, every minute booked against your time.

  it('a gate on a shipped ticket is not waiting on anybody', async () => {
    if (!HAS_CHROMIUM) return;
    const tickets = JSON.parse(run(TICKET, ['list', '--all', '--json'], appDir).stdout) as
      { id: number; title: string }[];
    const tid = tickets.find((t) => t.title === 'the old importer')!.id;   // already shipped
    // Forced open AFTER shipping, which is exactly the shape the real rows had:
    // the ticket moved on and the run row never did.
    const uid = run(TRACE, ['start', 'begin', '--ticket', String(tid)], appDir).stdout.trim().split('=')[1];
    run(TRACE, ['emit', 'ship', 'awaiting', '--run', uid], appDir);

    const { context, page, errors } = await open();
    try {
      await page.waitForSelector('.wait');
      expect(await page.locator('.wait .item').count()).toBe(0);
      expect(await page.locator('.wait .empty').count()).toBe(1);
      expect(errors).toEqual([]);
    } finally { await context.close(); run(TRACE, ['end', '--run', uid], appDir); }
  }, T);

  it('a gate on open work still shows, whatever its agent is doing', async () => {
    if (!HAS_CHROMIUM) return;
    // The negative of the test above, and the reason the rule is the ticket's
    // disposition rather than "the agent looks busy": Gate 2 waits by BLOCKING
    // on a long-running command, so a real plan review reports its agent as
    // working. Suppressing on that would hide the one thing this band is for.
    const tickets = JSON.parse(run(TICKET, ['list', '--all', '--json'], appDir).stdout) as
      { id: number; title: string }[];
    const tid = tickets.find((t) => t.title === 'index the corpus')!.id;
    const uid = run(TRACE, ['start', 'begin', '--ticket', String(tid)], appDir).stdout.trim().split('=')[1];
    run(TRACE, ['emit', 'approve', 'awaiting', '--run', uid], appDir);

    const { context, page, errors } = await open();
    try {
      await page.waitForSelector('.wait .item');
      expect(await page.locator('.wait .item').innerText()).toContain('index the corpus');
      expect(errors).toEqual([]);
    } finally { await context.close(); run(TRACE, ['end', '--run', uid], appDir); }
  }, T);

  it('a card does not read running when no session is live for it', async () => {
    if (!HAS_CHROMIUM) return;
    // #4's exact shape: worktree still on disk, run row still says running, and
    // no herdr agent anywhere near it. It used to render class="live" with a
    // clock ticking against a session that had been gone for days.
    const add = run(TICKET, ['add', 'its session went away', '--ready'], appDir);
    const tid = (add.stdout.match(/#(\d+)/) ?? [])[1]!;
    must(run(TICKET, ['start', tid], appDir), 'start');
    const uid = run(TRACE, ['start', 'begin', '--ticket', tid], appDir).stdout.trim().split('=')[1];

    const { context, page, errors } = await open();
    try {
      const card = page.locator('.card[data-tid="' + tid + '"]');
      await card.waitFor();
      // Not the class: CLS.in_progress is 'live' already, and that is the
      // ticket's STATUS styling rather than a claim about a session. What must
      // not appear is the running readout and its clock.
      expect(await card.innerText()).not.toContain('running');
      // A clock ticking for a session that does not exist was the visible half
      // of the bug — it kept counting for days.
      expect(await card.locator('[data-live="run"]').count()).toBe(0);
      // It falls back to saying what the ticket actually is.
      expect(await card.innerText().then((x) => x.toLowerCase())).toContain('building');
      expect(errors).toEqual([]);
    } finally {
      await context.close();
      run(TRACE, ['end', '--run', uid], appDir);
      run(TICKET, ['rm', tid, '--yes'], appDir);
    }
  }, T);

  // ── optimistic writes ──────────────────────────────────────────────────

  it('a description shows your text before the request resolves', async () => {
    if (!HAS_CHROMIUM) return;
    const { context, page, errors } = await open();
    try {
      await openBodyTicket(page);
      // Hold the PATCH open. Whatever is on screen while this is unanswered is,
      // by construction, the optimistic paint — before this change it was the
      // OLD text, unhidden by save() one line before it sent anything.
      let release: () => void = () => {};
      const held = new Promise<void>((r) => { release = r; });
      await page.route('**/api/tickets/**', async (route) => {
        if (route.request().method() !== 'PATCH') return route.continue();
        await held;
        return route.continue();
      });

      await page.keyboard.press('e');
      await page.waitForSelector('#pagedescedit.on');
      await page.locator('#pagedescedit').fill('painted before the round trip');
      await page.locator('#pagedescedit').press('Meta+Enter');

      await page.waitForSelector('#pagedesc:has-text("painted before the round trip")');
      expect(await page.locator('#pagedesc').innerText()).not.toContain('the first paragraph.');

      release();
      await untilStore(() => JSON.parse(spawnSync(TICKET, ['show', String(MD_TICKET), '--json'], {
        encoding: 'utf8', env: { ...process.env, SMRITI_HOME: HOME_DIR },
      }).stdout).ticket.body, 'painted before the round trip', 'optimistic body');
      expect(errors).toEqual([]);
    } finally {
      await context.close();
      run(TICKET, ['edit', String(MD_TICKET), '--body', MD_BODY], appDir);
    }
  }, T);

  it('a failed save hands your typing back instead of eating it', async () => {
    if (!HAS_CHROMIUM) return;
    // No errors assertion: the 500 is the point and the browser logs it.
    const { context, page } = await open();
    try {
      await openBodyTicket(page);
      await page.route('**/api/tickets/**', (route) =>
        route.request().method() === 'PATCH'
          ? route.fulfill({ status: 500, contentType: 'application/json',
                            body: JSON.stringify({ error: 'nope' }) })
          : route.continue());

      await page.keyboard.press('e');
      await page.waitForSelector('#pagedescedit.on');
      await page.locator('#pagedescedit').fill('words worth keeping');
      await page.locator('#pagedescedit').press('Meta+Enter');

      // The editor comes back, still holding what you wrote. Before this, the
      // failure only toasted: the box was already closed over the old text and
      // the next render rebuilt it from the value that never changed.
      await page.waitForSelector('#pagedescedit.on');
      expect(await page.locator('#pagedescedit').inputValue()).toBe('words worth keeping');
      // ...and the stored value is untouched, so nothing was half-applied.
      expect(JSON.parse(spawnSync(TICKET, ['show', String(MD_TICKET), '--json'], {
        encoding: 'utf8', env: { ...process.env, SMRITI_HOME: HOME_DIR },
      }).stdout).ticket.body).toBe(MD_BODY);
    } finally { await context.close(); }
  }, T);

  it('a failed save rolls the value back, so the retry is a real change again', async () => {
    if (!HAS_CHROMIUM) return;
    // Dropping the pending entry is not the same as undoing it: applyPending
    // writes into the live row, so forgetting the entry alone leaves the
    // rejected value sitting in S. For the description box that is worse than
    // cosmetic — current() then reports the text that FAILED, so retyping the
    // same words hits the "nothing changed" guard and the retry silently does
    // nothing at all.
    //
    // /api/state is blocked throughout, so only the rollback can put the value
    // back; otherwise the resync would paper over a missing one.
    const { context, page } = await open();
    try {
      await openBodyTicket(page);
      await page.route('**/api/state', (route) => route.abort());
      let patches = 0;
      await page.route('**/api/tickets/**', (route) => {
        if (route.request().method() !== 'PATCH') return route.continue();
        patches++;
        return route.fulfill({ status: 500, contentType: 'application/json',
                               body: JSON.stringify({ error: 'nope' }) });
      });

      await page.keyboard.press('e');
      await page.waitForSelector('#pagedescedit.on');
      await page.locator('#pagedescedit').fill('a retry worth making');
      await page.locator('#pagedescedit').press('Meta+Enter');
      await page.waitForSelector('#pagedescedit.on');
      expect(patches).toBe(1);

      // Exactly the same text again. It must still be seen as a change, which
      // it only is if the failure put the stored value back.
      await page.locator('#pagedescedit').press('Meta+Enter');
      await page.waitForFunction(() => true);
      await page.waitForTimeout(400);
      expect(patches).toBe(2);
    } finally { await context.close(); }
  }, T);

  it('picking the app a ticket is already in does not strand it', async () => {
    if (!HAS_CHROMIUM) return;
    // cmd_edit only clears the project when the repo actually changes, so an
    // overlay that claimed project_id=null for a no-op move would never match
    // the echo — and would be re-applied over every read for the life of the
    // tab, showing the ticket as loose forever.
    const { context, page, errors } = await open();
    try {
      const tickets = JSON.parse(run(TICKET, ['list', '--all', '--json'], appDir).stdout) as any[];
      const t = tickets.find((x) => x.title === 'index the corpus');
      expect(t.project_ref).toBe('search-v2');

      await page.locator('.card[data-tid="' + t.id + '"]').click();
      await page.waitForSelector('.stub');
      await page.keyboard.press('a');
      await page.locator('#palopts .o:has-text("test-demo")').first().click();

      // Give the write and its echo a moment, then confirm the project survived
      // both on screen and in the store.
      await page.waitForTimeout(600);
      await page.waitForSelector('.stub .f[data-field="project"]:has-text("Search v2")');
      expect(ticketRow(t.id).project_ref).toBe('search-v2');
      expect(errors).toEqual([]);
    } finally { await context.close(); }
  }, T);

  // ── projects: rename, create, delete ───────────────────────────────────
  //
  // The CLI and the API could do all three since both existed. The board simply
  // never called any of it, so a project's name was fixed from the moment it was
  // made and a stray one could not be got rid of at all.

  it('a project is renamed from its own page', async () => {
    if (!HAS_CHROMIUM) return;
    must(run(PROJECT, ['add', 'Renamable', '--repo', 'test-demo'], appDir), 'add project');
    const pid = (JSON.parse(run(PROJECT, ['list', '--all', '--json'], appDir).stdout) as any[])
      .find((p) => p.name === 'Renamable').id;
    const { context, page, errors } = await open('#/p/' + pid);
    try {
      await page.locator('.slab h1.rename').click();
      // Seeded with the current name and selected, so a rename is an edit
      // rather than a retype.
      expect(await page.locator('#palq').inputValue()).toBe('Renamable');
      await page.locator('#palq').fill('Renamed For Real');
      await page.locator('#palopts .o:has-text("Rename to")').click();

      await page.waitForSelector('.slab h1:has-text("Renamed For Real")');
      await untilStore(() => (JSON.parse(run(PROJECT, ['list', '--all', '--json'], appDir).stdout) as any[])
        .some((p) => p.name === 'Renamed For Real'), true, 'project rename');
      expect(errors).toEqual([]);
    } finally {
      await context.close();
      run(PROJECT, ['rm', String(pid), '--yes'], appDir);
    }
  }, T);

  it('renaming to the same name offers nothing to commit', async () => {
    if (!HAS_CHROMIUM) return;
    must(run(PROJECT, ['add', 'Untouched', '--repo', 'test-demo'], appDir), 'add project');
    const pid = (JSON.parse(run(PROJECT, ['list', '--all', '--json'], appDir).stdout) as any[])
      .find((p) => p.name === 'Untouched').id;
    const { context, page, errors } = await open('#/p/' + pid);
    try {
      await page.locator('.slab h1.rename').click();
      await page.waitForSelector('#palq');
      // An accidental Enter on the untouched name should close the picker, not
      // fire a pointless write.
      expect(await page.locator('#palopts .o').count()).toBe(0);
      expect(errors).toEqual([]);
    } finally {
      await context.close();
      run(PROJECT, ['rm', String(pid), '--yes'], appDir);
    }
  }, T);

  it('a project is created from the palette, into the app you are looking at', async () => {
    if (!HAS_CHROMIUM) return;
    const { context, page, errors } = await open('#/r/test-demo');
    try {
      await page.waitForSelector('.slab');
      await page.keyboard.press('c');
      await page.locator('#palq').fill('Built From The Palette');
      await page.locator('#palopts .o:has-text("New project")').click();

      await page.waitForSelector('.slab h1:has-text("Built From The Palette")');
      // The page is optimistic now, so its appearance is no longer proof the
      // row was written — poll the store rather than reading it on that signal.
      await untilStore(() => (JSON.parse(run(PROJECT, ['list', '--all', '--json'], appDir).stdout) as any[])
        .some((p) => p.name === 'Built From The Palette'), true, 'palette project');
      const made = (JSON.parse(run(PROJECT, ['list', '--all', '--json'], appDir).stdout) as any[])
        .find((p) => p.name === 'Built From The Palette');
      expect(made).toBeTruthy();
      expect(made.repo_slug).toBe('test-demo');   // the app you were standing in
      expect(errors).toEqual([]);
      run(PROJECT, ['rm', String(made.id), '--yes'], appDir);
    } finally { await context.close(); }
  }, T);

  it('a new project appears and opens before the server answers', async () => {
    if (!HAS_CHROMIUM) return;
    // Creating used to be POST → await refresh() → navigate: two full round
    // trips, the second of which is five CLI spawns, before anything at all was
    // on screen. The page now exists on the keystroke.
    const { context, page } = await open('#/r/test-demo');
    try {
      await page.waitForSelector('.slab');
      let release: () => void = () => {};
      const held = new Promise<void>((r) => { release = r; });
      await page.route('**/api/projects', async (route) => {
        if (route.request().method() !== 'POST') return route.continue();
        await held;
        return route.continue();
      });

      await page.keyboard.press('c');
      await page.locator('#palq').fill('Optimistically Made');
      await page.locator('#palopts .o:has-text("New project")').click();

      // On its own page, with its name, while the POST is still unanswered.
      await page.waitForSelector('.slab h1:has-text("Optimistically Made")');
      expect(page.url()).toContain('#/p/-');       // the placeholder route
      // ...and nothing destructive can be aimed at an id the server has never
      // seen.
      await page.locator('[data-act="delproj"]').click();
      await page.waitForSelector('#toast:has-text("still being created")');

      // Exactly one row in the margin, not two. The placeholder row is the one
      // the state already holds; promoting the entry without rewriting it left
      // a second row beside it until a refresh replaced the state wholesale.
      const railRows = () => page.locator('#rail .rproj:has-text("Optimistically Made")').count();
      expect(await railRows()).toBe(1);

      release();
      // The real id takes over, and the placeholder route is replaced rather
      // than left behind as a back-button destination.
      await page.waitForFunction(() => !/#\/p\/-/.test(location.hash));
      // Still one, now under the real id — and it stays one once the server's
      // own copy arrives.
      expect(await railRows()).toBe(1);
      expect(await page.locator('#rail .rproj[data-proj^="-"]').count()).toBe(0);
      await untilStore(() => (JSON.parse(run(PROJECT, ['list', '--all', '--json'], appDir).stdout) as any[])
        .some((p) => p.name === 'Optimistically Made'), true, 'project create');
      const made = (JSON.parse(run(PROJECT, ['list', '--all', '--json'], appDir).stdout) as any[])
        .find((p) => p.name === 'Optimistically Made');
      expect(page.url()).toContain('#/p/' + made.id);
      run(PROJECT, ['rm', String(made.id), '--yes'], appDir);
    } finally { await context.close(); }
  }, T);

  it('a create the server refuses takes its page away again', async () => {
    if (!HAS_CHROMIUM) return;
    // No errors assertion: the 500 is the point.
    const { context, page } = await open('#/r/test-demo');
    try {
      await page.waitForSelector('.slab');
      await page.route('**/api/projects', (route) =>
        route.request().method() === 'POST'
          ? route.fulfill({ status: 500, contentType: 'application/json',
                            body: JSON.stringify({ error: 'nope' }) })
          : route.continue());

      await page.keyboard.press('c');
      await page.locator('#palq').fill('Never Was');
      await page.locator('#palopts .o:has-text("New project")').click();

      await page.waitForSelector('#toast:has-text("could not create")');
      // Back on the app it was made from, and gone from the margin.
      // waitForFunction on the hash alone is satisfied by the hash CHANGING,
       // which can precede the hashchange handler that redraws. Wait for the
       // margin itself to agree.
      await page.waitForFunction(() =>
        location.hash === '#/r/test-demo' && !/Never Was/.test(document.querySelector('#rail')?.textContent || ''));
      expect((JSON.parse(run(PROJECT, ['list', '--all', '--json'], appDir).stdout) as any[])
        .some((p) => p.name === 'Never Was')).toBe(false);
    } finally { await context.close(); }
  }, T);

  it('a deleted project leaves the margin before the server answers', async () => {
    if (!HAS_CHROMIUM) return;
    must(run(PROJECT, ['add', 'Vanishing', '--repo', 'test-demo'], appDir), 'add project');
    const pid = (JSON.parse(run(PROJECT, ['list', '--all', '--json'], appDir).stdout) as any[])
      .find((p) => p.name === 'Vanishing').id;
    must(run(TICKET, ['add', 'goes loose', '--project', String(pid)], appDir), 'add ticket');
    const tid = (JSON.parse(run(TICKET, ['list', '--all', '--json'], appDir).stdout) as any[])
      .find((t) => t.title === 'goes loose').id;

    const { context, page } = await open('#/p/' + pid);
    try {
      let release: () => void = () => {};
      const held = new Promise<void>((r) => { release = r; });
      await page.route('**/api/projects/**', async (route) => {
        if (route.request().method() !== 'DELETE') return route.continue();
        await held;
        return route.continue();
      });

      await page.locator('[data-act="delproj"]').click();
      await page.waitForSelector('[data-act="delproj"]:has-text("tickets go loose")');
      await page.locator('[data-act="delproj"]').click();

      // Off the page and out of the margin while the DELETE is still in flight.
      await page.waitForFunction(() =>
        location.hash === '#/r/test-demo' && !/Vanishing/.test(document.querySelector('#rail')?.textContent || ''));
      // And the promise the label makes holds locally too: the ticket is still
      // there, just no longer under a heading that has gone.
      await page.waitForSelector('.card:has-text("goes loose")');

      release();
      await untilStore(() => (JSON.parse(run(PROJECT, ['list', '--all', '--json'], appDir).stdout) as any[])
        .some((p) => p.id === pid), false, 'project delete');
    } finally { await context.close(); run(TICKET, ['rm', String(tid), '--yes'], appDir); }
  }, T);

  it('a captured ticket shows as saving, and is not openable until it is real', async () => {
    if (!HAS_CHROMIUM) return;
    const { context, page } = await open('#/r/test-demo');
    try {
      await page.waitForSelector('.slab');
      let release: () => void = () => {};
      const held = new Promise<void>((r) => { release = r; });
      await page.route('**/api/tickets', async (route) => {
        if (route.request().method() !== 'POST') return route.continue();
        await held;
        return route.continue();
      });

      // /api/state blocked from here on. The duplicate this guards against is
      // erased by the very next full read — which is why it presented as "one
      // of them went away" rather than as a bug — so a resync must not be
      // allowed to answer the question the assertion is asking.
      await page.route('**/api/state', (route) => route.abort());

      await page.keyboard.press('c');
      await page.locator('#palq').fill('captured optimistically');
      await page.locator('#palopts .o:has-text("New ticket")').click();

      const card = page.locator('.card:has-text("captured optimistically")');
      await card.waitFor();
      // Present and legible, but carrying no id to open — a page for a ticket
      // the server has never heard of would offer a start button that cannot work.
      expect((await card.innerText()).toLowerCase()).toContain('saving');
      expect(await card.getAttribute('data-tid')).toBeNull();

      expect(await page.locator('.card:has-text("captured optimistically")').count()).toBe(1);

      release();
      await page.waitForSelector('.card[data-tid]:has-text("captured optimistically")');
      // One card, not the placeholder plus the real one.
      expect(await page.locator('.card:has-text("captured optimistically")').count()).toBe(1);
      const made = (JSON.parse(run(TICKET, ['list', '--all', '--json'], appDir).stdout) as any[])
        .find((t) => t.title === 'captured optimistically');
      expect(made).toBeTruthy();
      run(TICKET, ['rm', String(made.id), '--yes'], appDir);
    } finally { await context.close(); }
  }, T);

  it('deleting a project arms first, and says the tickets survive', async () => {
    if (!HAS_CHROMIUM) return;
    must(run(PROJECT, ['add', 'Doomed', '--repo', 'test-demo'], appDir), 'add project');
    const pid = (JSON.parse(run(PROJECT, ['list', '--all', '--json'], appDir).stdout) as any[])
      .find((p) => p.name === 'Doomed').id;
    must(run(TICKET, ['add', 'survives its project', '--project', String(pid)], appDir), 'add ticket');
    const tid = (JSON.parse(run(TICKET, ['list', '--all', '--json'], appDir).stdout) as any[])
      .find((t) => t.title === 'survives its project').id;

    const { context, page, errors } = await open('#/p/' + pid);
    try {
      const btn = page.locator('[data-act="delproj"]');
      await btn.click();
      // One press only arms it — the label has to say what is actually at stake,
      // because "delete project" reads like it takes the work with it.
      await page.waitForSelector('[data-act="delproj"]:has-text("tickets go loose")');
      expect((JSON.parse(run(PROJECT, ['list', '--all', '--json'], appDir).stdout) as any[])
        .some((p) => p.id === pid)).toBe(true);

      await page.locator('[data-act="delproj"]').click();
      await untilStore(() => (JSON.parse(run(PROJECT, ['list', '--all', '--json'], appDir).stdout) as any[])
        .some((p) => p.id === pid), false, 'project delete');
      // The promise the label makes: the ticket is still there, just loose.
      const t = (JSON.parse(run(TICKET, ['list', '--all', '--json'], appDir).stdout) as any[])
        .find((x) => x.id === tid);
      expect(t).toBeTruthy();
      expect(t.project_ref).toBeFalsy();
      expect(errors).toEqual([]);
    } finally { await context.close(); run(TICKET, ['rm', String(tid), '--yes'], appDir); }
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

  // ── photos in a description ──────────────────────────────────────────
  //
  // The hard part of pasting is not the paste, it is that the upload is slower
  // than everything around it: the editor is rebuilt about once a second, saves
  // on blur, and abandons on Escape. These pin the three ways that can go wrong.

  // A genuinely decodable 1×1 PNG, not just its signature: one of these tests
  // asserts the browser actually paints what came back, and a header alone
  // decodes to nothing and would fail for the wrong reason.
  const PNG_B64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  // Dispatched the way Chromium delivers a screenshot: a ClipboardEvent
  // carrying a File. page.keyboard cannot paste an image.
  async function pasteImage(page: import('playwright').Page, sel = '#pagedescedit') {
    await page.evaluate(([s, b64]) => {
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const dt = new DataTransfer();
      dt.items.add(new File([bytes], 'shot.png', { type: 'image/png' }));
      document.querySelector(s)!.dispatchEvent(
        new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }),
      );
    }, [sel, PNG_B64]);
  }

  it('pasting a screenshot stores it and renders it in the description', async () => {
    if (!HAS_CHROMIUM) return;
    const { context, page, errors } = await open();
    try {
      await openBodyTicket(page);
      await page.keyboard.press('e');
      await page.waitForSelector('#pagedescedit.on');
      await page.locator('#pagedescedit').fill('the failing dialog:\n\n');
      await pasteImage(page);

      // The placeholder goes in at once — the point of it is that there is no
      // dead beat between the paste and something appearing.
      await page.waitForFunction(() =>
        (document.querySelector('#pagedescedit') as HTMLTextAreaElement).value.includes('uploading…'));
      // …and is replaced by the real reference when the server answers.
      await page.waitForFunction(() => {
        const v = (document.querySelector('#pagedescedit') as HTMLTextAreaElement).value;
        return /smriti:\/\/photo\/\d+\)/.test(v) && !v.includes('uploading…');
      });

      await page.locator('#pagedescedit').press('Meta+Enter');
      await page.waitForSelector('#pagedesc img');
      const src = await page.locator('#pagedesc img').getAttribute('src');
      expect(src).toMatch(/^\/api\/photo\/\d+$/);
      // It really is served and painted, not merely referenced. Waited for
      // rather than asserted once: the <img> is in the DOM before its bytes
      // have arrived, so a single read races the load every time.
      await page.waitForFunction(() => {
        const el = document.querySelector('#pagedesc img') as HTMLImageElement | null;
        return Boolean(el && el.complete && el.naturalWidth > 0);
      });
      // And the stored body carries the reference, not the placeholder.
      const body = String(ticketRow(MD_TICKET).body || '');
      expect(body).toMatch(/!\[]\(smriti:\/\/photo\/\d+\)/);
      expect(body).not.toContain('uploading…');
      expect(errors).toEqual([]);
    } finally { await context.close(); }
  }, T);

  it('a placeholder is never saved into a description', async () => {
    if (!HAS_CHROMIUM) return;
    const { context, page, errors } = await open();
    try {
      // Hold the upload open, then commit immediately. Without the save
      // awaiting its own editor's uploads, this writes "uploading…" into the
      // ticket body and the picture is lost to a description that says so
      // forever.
      let release: (() => void) | null = null;
      const held = new Promise<void>((r) => { release = r; });
      await page.route('**/api/photos', async (route) => { await held; route.continue(); });

      await openBodyTicket(page);
      await page.keyboard.press('e');
      await page.waitForSelector('#pagedescedit.on');
      await page.locator('#pagedescedit').fill('holding:\n\n');
      await pasteImage(page);
      await page.waitForFunction(() =>
        (document.querySelector('#pagedescedit') as HTMLTextAreaElement).value.includes('uploading…'));

      const committed = page.locator('#pagedescedit').press('Meta+Enter');
      // The editor stays open and visible while the upload is still in the air —
      // the honest thing to show, and what proves the save is actually waiting.
      await page.waitForTimeout(150);
      expect(await page.locator('#pagedescedit.on').count()).toBe(1);

      release!();
      await committed;
      await page.waitForSelector('#pagedesc img');
      const body = String(ticketRow(MD_TICKET).body || '');
      expect(body).not.toContain('uploading…');
      expect(body).toMatch(/smriti:\/\/photo\/\d+/);
      expect(errors).toEqual([]);
    } finally { await context.close(); }
  }, T);

  it('a failed upload takes its placeholder with it and keeps your typing', async () => {
    if (!HAS_CHROMIUM) return;
    const { context, page, errors } = await open();
    try {
      await page.route('**/api/photos', (route) =>
        route.fulfill({ status: 415, contentType: 'application/json',
          body: JSON.stringify({ error: 'that is not a photo smriti stores' }) }));

      await openBodyTicket(page);
      await page.keyboard.press('e');
      await page.waitForSelector('#pagedescedit.on');
      await page.locator('#pagedescedit').fill('words worth keeping');
      await pasteImage(page);

      await page.waitForSelector('#toast.on');
      expect(await page.locator('#toast').innerText()).toContain('not a photo');
      // The box is left exactly as it was, placeholder gone, text intact.
      const v = await page.locator('#pagedescedit').inputValue();
      expect(v).toBe('words worth keeping');
      // A refusal is reported through the toast, not thrown as a page error.
      // The browser's own "failed to load resource" line for the 415 is the
      // expected noise here and is not ours to suppress.
      expect(errors.filter((e) => !/Failed to load resource/.test(e))).toEqual([]);
    } finally { await context.close(); }
  }, T);

  it('an ordinary text paste is left alone', async () => {
    if (!HAS_CHROMIUM) return;
    const { context, page, errors } = await open();
    try {
      let uploads = 0;
      await page.route('**/api/photos', (route) => { uploads++; route.abort(); });
      await openBodyTicket(page);
      await page.keyboard.press('e');
      await page.waitForSelector('#pagedescedit.on');
      await page.evaluate(() => {
        const dt = new DataTransfer();
        dt.setData('text/plain', 'just words');
        document.querySelector('#pagedescedit')!.dispatchEvent(
          new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }),
        );
      });
      await page.waitForTimeout(120);
      expect(uploads).toBe(0);
      expect(await page.locator('#pagedescedit').inputValue()).not.toContain('uploading…');
      expect(errors).toEqual([]);
    } finally { await context.close(); }
  }, T);

  it('the editor says how to add a photo, and only while it is open', async () => {
    if (!HAS_CHROMIUM) return;
    const { context, page, errors } = await open();
    try {
      await openBodyTicket(page);
      // A hint nobody can act on is furniture — hidden until there is an editor.
      expect(await page.locator('.dhint').isVisible()).toBe(false);
      await page.keyboard.press('e');
      await page.waitForSelector('#pagedescedit.on');
      expect(await page.locator('.dhint').isVisible()).toBe(true);
      expect(await page.locator('.dhint').innerText()).toContain('paste or drop an image');
      expect(errors).toEqual([]);
    } finally { await context.close(); }
  }, T);
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

  // A key earns a slot in the bottom bar only when nothing on screen can wear
  // it. b and h each have a control that is always visible, so the control
  // carries the key and the bar stays a list of ten.
  it('carries its own key hint, and the bottom bar does not', async () => {
    if (!HAS_CHROMIUM) return;
    const { context, page, errors } = await open();
    try {
      // Not an exact count — the bar legitimately grows when a key has nowhere
      // else to live. What must stay true is that a key with a control on
      // screen is not ALSO listed here.
      // #keys, not .keys: the move-mode legend is a second .keys bar, hidden
      // until a card is being carried.
      const bar = (await page.locator('#keys').innerText()).toLowerCase();
      expect(bar).not.toContain('margin');
      expect(bar).not.toContain('completed');
      expect(await page.locator('#keys .k[data-k="b"]').count()).toBe(0);
      expect(await page.locator('#keys .k[data-k="h"]').count()).toBe(0);

      // Legible at rest, not hover-only: the board replaces its html about once
      // a second, and a swap under a still cursor never regains :hover.
      const hint = page.locator('.rtab .kb');
      expect((await hint.innerText()).toLowerCase()).toBe('b');
      expect(Number(await hint.evaluate((el) => getComputedStyle(el).opacity))).toBe(1);

      // And the full list is still one keypress away.
      await page.keyboard.press('?');
      await page.waitForSelector('#helpv.on');
      const help = (await page.locator('#helpv').innerText()).toLowerCase();
      expect(help).toContain('the margin');
      expect(help).toContain('completed work');
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

// What the run concluded, on a finished run. Until this existed the text lived
// only in a herdr pane, so shipping — which lets the board close that pane —
// destroyed it. These are browser tests because the renderer lives inside the
// one big template string and nothing else parses it.
describe('the closing report', () => {
  // trace report takes its body on stdin, which the shared run() helper has no
  // way to supply.
  const report = (uid: string, body: string, source = 'run') =>
    spawnSync(TRACE, ['report', '--run', uid, '--source', source], {
      encoding: 'utf8', cwd: appDir, input: body,
      env: { ...process.env, SMRITI_HOME: HOME_DIR },
    });

  function finishedRunOn(title: string, body: string, source = 'run'): number {
    const tid = idOf(title);
    const uid = run(TRACE, ['start', 'begin', '--ticket', String(tid)], appDir).stdout.trim().split('=')[1];
    run(TRACE, ['emit', 'plan', 'ok', '--run', uid], appDir);
    run(TRACE, ['emit', 'implement', 'ok', '--run', uid], appDir);
    expect(report(uid, body, source).status).toBe(0);
    run(TRACE, ['end', '--run', uid], appDir);
    return tid;
  }

  async function openRunBody(page: import('playwright').Page, tid: number) {
    await page.goto(url.split('?')[0] + '#/t/' + tid, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#runs .run');
    await page.waitForSelector('#runs .run .bd .rep');
  }

  it('a run-written report renders as labelled rows, with no provenance line', async () => {
    if (!HAS_CHROMIUM) return;
    const tid = finishedRunOn('index the corpus',
      '✅ /begin complete on t9-demo\n   built:  the parser\n   review: 2 findings, both fixed\n');
    const { context, page, errors } = await open();
    try {
      await openRunBody(page, tid);
      const keys = await page.locator('#runs .rep .r .lb').allTextContents();
      expect(keys).toEqual(['built', 'review']);
      const vals = await page.locator('#runs .rep .r .v').allTextContents();
      expect(vals[0]).toBe('the parser');
      expect(vals[1]).toBe('2 findings, both fixed');
      // The ✅ headline is the terminal's greeting, not a field; the board has
      // its own way of saying a run finished.
      expect(await page.locator('#runs .rep').innerText()).not.toContain('/begin complete');
      // No badge on the normal case: a marker worn by everything teaches the
      // eye to skip it, and then the exceptional case cannot be signalled.
      expect(await page.locator('#runs .rep.scraped').count()).toBe(0);
      expect(await page.locator('#runs .rep .prov').count()).toBe(0);
      expect(errors).toEqual([]);
    } finally { await context.close(); }
  }, T);

  it('a scraped report says so, and folds its raw terminal text away', async () => {
    if (!HAS_CHROMIUM) return;
    const tid = finishedRunOn('a one-off bug', 'built: from the terminal\nnoise from a spinner\n', 'pane');
    const { context, page, errors } = await open();
    try {
      await openRunBody(page, tid);
      expect(await page.locator('#runs .rep.scraped').count()).toBe(1);
      expect(await page.locator('#runs .rep .prov').innerText()).toContain('recovered from the terminal');
      expect(await page.locator('#runs .rep .raw').innerText()).toContain('noise from a spinner');
      // Bounded and scrolling in place, so a scrape cannot become a wall — and
      // no open/closed state to be reset by the page's own redraw.
      const box = await page.locator('#runs .rep .raw').evaluate((el) =>
        ({ max: getComputedStyle(el).maxHeight, over: getComputedStyle(el).overflowY }));
      expect(box.max).not.toBe('none');
      expect(['auto', 'scroll']).toContain(box.over);
      expect(errors).toEqual([]);
    } finally { await context.close(); }
  }, T);

  it('parses the fields the /begin template actually writes', async () => {
    if (!HAS_CHROMIUM) return;
    // Two regressions in one: `next (you):` is the canonical LAST line of a
    // /begin report, and a label class of [a-z ] excluded its parentheses — so
    // the one row always present was the one row that never got a label. And a
    // bare URL must not parse as a field, or `https://…` renders an uppercase
    // HTTPS label beside a mangled value.
    const tid = finishedRunOn('an idea with no app',
      'built: the thing\n' +
      'next (you): test it, then say the word to ship.\n' +
      'https://github.com/test/demo/pull/12\n');
    const { context, page, errors } = await open();
    try {
      await openRunBody(page, tid);
      const keys = await page.locator('#runs .rep .r .lb').allTextContents();
      expect(keys).toEqual(['built', 'next (you)']);
      const rows = await page.locator('#runs .rep .r').allTextContents();
      // The URL survives as its own unlabelled line rather than being split.
      expect(rows[2]).toContain('https://github.com/test/demo/pull/12');
      expect(keys).not.toContain('https');
      expect(errors).toEqual([]);
    } finally { await context.close(); }
  }, T);

  it('a report cannot inject markup', async () => {
    if (!HAS_CHROMIUM) return;
    // A scraped body is raw terminal bytes from a process the board did not
    // write, so it is exactly the value that must not reach innerHTML unescaped.
    const tid = finishedRunOn('a ticket with a real body',
      'built: <img src=x onerror="window.__pwned=1">\n', 'pane');
    const { context, page, errors } = await open();
    try {
      await openRunBody(page, tid);
      expect(await page.locator('#runs .rep .raw img').count()).toBe(0);
      expect(await page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned)).toBeUndefined();
      expect(await page.locator('#runs .rep .raw').innerText()).toContain('onerror');
      expect(errors).toEqual([]);
    } finally { await context.close(); }
  }, T);
});

// The board, specifically. The fold test above runs on an app page, and the
// exemption that broke this only ever existed on the board — which is exactly
// why it shipped: the behaviour was tested on the one surface that did not have
// it. A ticket shipped moments ago stayed on the board with completed work
// switched off, so the toggle looked broken for precisely the cards you had
// just finished and most wanted gone.
describe('the fold, on the board itself', () => {
  it('a just-shipped ticket is folded away like any other finished work', async () => {
    if (!HAS_CHROMIUM) return;
    const { context, page, errors } = await open();
    try {
      // "the old importer" was marked done seconds ago by the fixture, so it is
      // as recent as a shipped ticket can be.
      const live = (await page.locator('#plots .card .t').allInnerTexts()).join(' | ');
      expect(live).not.toContain('the old importer');
      expect(live).not.toContain('a road not taken');

      // ...and h still brings it back, so nothing became unreachable.
      await page.keyboard.press('h');
      await page.waitForSelector('.card.done');
      const revealed = (await page.locator('.card.done .t').allInnerTexts()).join(' | ');
      expect(revealed).toContain('the old importer');
      expect(errors).toEqual([]);
    } finally { await context.close(); }
  }, T);
});

// Ticket #11: drag to order tickets, and make that order stick.
//
// The app page is the surface used here because it draws ONE .cards grid — the
// loose tickets — so "what order are they in" is a straight read rather than a
// question about which group you meant. The CLI and HTTP layers are covered in
// ticket.bats and board.test.ts; what only exists in a browser is the gesture
// itself, the keyboard carry, and whether a live redraw eats either of them.
describe('reordering', () => {
  const ORD = ['reorder alpha', 'reorder beta'];

  beforeAll(() => {
    if (!HAS_CHROMIUM) return;
    // Appended, and this block is last in the file: earlier tests count cards
    // and would fail if the fixture grew underneath them.
    for (const t of ORD) must(run(TICKET, ['add', t, '--ready'], appDir), 'add ' + t);
  });

  // A viewport tall enough to hold the whole loose group. page.mouse works in
  // viewport coordinates, so a card below the fold has coordinates that are not
  // on screen and every click lands on <html> instead — and scrollIntoView is
  // not the fix, because the SSE redraw detaches the element mid-scroll.
  const openTall = async (hash: string) => {
    const o = await open(hash);
    await o.page.setViewportSize({ width: 1400, height: 1600 });
    await o.page.waitForSelector('#plots .cards .card');
    // The app page fetches PROJECT.md and injects it AFTER first paint, which
    // pushes the card grid down the page. Measuring a card before that lands
    // gives coordinates the mouse then arrives at pointing somewhere else — the
    // drag reads as working and drops in the wrong place. Wait for the pane to
    // fill, then for two clean frames, before anything measures geometry.
    await o.page.waitForFunction(() => {
      const d = document.querySelector('#docpane');
      return !d || (d as HTMLElement).innerHTML.length > 0;
    });
    await o.page.evaluate(() => new Promise((r) =>
      requestAnimationFrame(() => requestAnimationFrame(() => r(null)))));
    return o;
  };

  // Titles in drawn order, from the one grid the app page renders. Excludes the
  // completed fold, which is deliberately not reorderable.
  const order = (page: any) =>
    page.$$eval('#plots .cards:not(.folded) .card .t', (els: any[]) => els.map((e) => e.innerText));

  const boxOf = async (page: any, title: string) => {
    const b = await page.locator('#plots .card', { hasText: title }).first().boundingBox();
    if (!b) throw new Error('no card for ' + title);
    return b;
  };

  it('a card dragged onto another lands there, and the order survives a reload', async () => {
    if (!HAS_CHROMIUM) return;
    const { context, page, errors } = await openTall('#/r/test-demo');
    try {
      const before = await order(page);
      expect(before[0]).toBe('a one-off bug');
      expect(before).toContain('reorder beta');

      const from = await boxOf(page, 'reorder beta');
      const to = await boxOf(page, 'a one-off bug');
      await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
      await page.mouse.down();
      // Past the 5px threshold first, so the gesture is a drag and not a click,
      // then onto the LEFT half of the target, which means "before this one".
      await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2 - 40, { steps: 5 });
      await page.mouse.move(to.x + to.width * 0.25, to.y + to.height / 2, { steps: 10 });

      // Mid-flight: the card is in your hand and a slot marks where it lands.
      expect(await page.locator('.card.drag').count()).toBe(1);
      expect(await page.locator('.slot').count()).toBe(1);

      const wrote = page.waitForResponse((r: any) => r.url().includes('/move'));
      await page.mouse.up();
      expect((await wrote).status()).toBe(200);
      await page.waitForFunction(() => document.querySelectorAll('.slot').length === 0);

      expect((await order(page))[0]).toBe('reorder beta');
      // A drag must not also open the ticket it was holding.
      expect(page.url()).toContain('#/r/test-demo');

      // The real claim: it stuck. Re-read from the store, not from the DOM.
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => (document.querySelector('#plots')?.children.length ?? 0) > 0);
      expect((await order(page))[0]).toBe('reorder beta');
      expect(errors).toEqual([]);
    } finally { await context.close(); }
  }, T);

  it('shift-J carries the selected card, and esc puts it back', async () => {
    if (!HAS_CHROMIUM) return;
    const { context, page, errors } = await openTall('#/r/test-demo');
    try {
      const before = await order(page);
      await page.keyboard.press('ArrowDown');          // select the first card
      await page.waitForSelector('.card.sel');

      await page.keyboard.press('Shift+J');
      await page.waitForSelector('.card.carry');
      // Lifted, and the keycap bar swapped to the move legend.
      expect(await page.locator('#movekeys').isVisible()).toBe(true);
      const moved = await order(page);
      expect(moved[0]).toBe(before[1]);
      expect(moved[1]).toBe(before[0]);

      await page.keyboard.press('Escape');
      await page.waitForFunction(() => document.querySelectorAll('.card.carry').length === 0);
      expect(await order(page)).toEqual(before);
      expect(await page.locator('#movekeys').isVisible()).toBe(false);
      // esc put the card down; it did NOT also navigate up a level.
      expect(page.url()).toContain('#/r/test-demo');
      expect(errors).toEqual([]);
    } finally { await context.close(); }
  }, T);

  it('shift-J then enter commits, and the store agrees', async () => {
    if (!HAS_CHROMIUM) return;
    const { context, page, errors } = await openTall('#/r/test-demo');
    try {
      const before = await order(page);
      await page.keyboard.press('ArrowDown');
      await page.waitForSelector('.card.sel');
      await page.keyboard.press('Shift+J');
      await page.waitForSelector('.card.carry');

      const wrote = page.waitForResponse((r: any) => r.url().includes('/move'));
      await page.keyboard.press('Enter');
      expect((await wrote).status()).toBe(200);
      await page.waitForFunction(() => document.querySelectorAll('.card.carry').length === 0);

      // Enter dropped the card. It must not ALSO have opened the ticket.
      expect(page.url()).toContain('#/r/test-demo');

      const listed = JSON.parse(run(TICKET, ['list', '--all', '--json'], appDir).stdout)
        .filter((t: any) => t.repo_slug === 'test-demo' && t.project_id == null &&
                            !['shipped', 'cancelled'].includes(t.status))
        .map((t: any) => t.title);
      expect(listed[0]).toBe(before[1]);
      expect(errors).toEqual([]);
    } finally { await context.close(); }
  }, T);

  it('a live redraw does not eat a drag in flight', async () => {
    if (!HAS_CHROMIUM) return;
    // The sharpest edge in this whole feature. #plots is replaced wholesale
    // whenever the store changes — about once a second while an agent runs —
    // and doing that mid-gesture pulls the card out from under the cursor.
    const { context, page, errors } = await openTall('#/r/test-demo');
    try {
      const from = await boxOf(page, 'reorder alpha');
      await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
      await page.mouse.down();
      await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2 - 60, { steps: 5 });
      expect(await page.locator('.card.drag').count()).toBe(1);

      // A write from outside the board entirely — the mtime watcher notices and
      // broadcasts, which is the same path an agent's run takes.
      must(run(TICKET, ['add', 'noise from another process', '--repo', '-'], appDir), 'add noise');
      await page.waitForTimeout(1800);

      // Still airborne, still with somewhere to land.
      expect(await page.locator('.card.drag').count()).toBe(1);
      expect(await page.locator('.slot').count()).toBe(1);

      await page.mouse.up();
      await page.waitForFunction(() => document.querySelectorAll('.slot').length === 0);
      expect(errors).toEqual([]);
    } finally { await context.close(); }
  }, T);

  it('completed work in the fold is not draggable', async () => {
    if (!HAS_CHROMIUM) return;
    const { context, page, errors } = await openTall('#/r/test-demo');
    try {
      await page.keyboard.press('h');
      await page.waitForSelector('.card.done');
      const done = await page.locator('.card.done').first().boundingBox();
      await page.mouse.move(done!.x + done!.width / 2, done!.y + done!.height / 2);
      await page.mouse.down();
      await page.mouse.move(done!.x + done!.width / 2, done!.y - 80, { steps: 8 });
      // No lift, no slot: a hand-placed sequence over shipped work is a number
      // nobody reads, so the fold never offers the gesture.
      expect(await page.locator('.card.drag').count()).toBe(0);
      expect(await page.locator('.slot').count()).toBe(0);
      await page.mouse.up();
      expect(errors).toEqual([]);
    } finally { await context.close(); }
  }, T);
});

// ─── dependencies (#12) ─────────────────────────────────────────────────────
//
// Fixtures live in their OWN app rather than in the shared one. Dependency
// states change how a card draws, and the reordering tests measure a drag
// against the loose group of test-demo — five more cards in it moves the
// geometry those tests aim at. A separate app keeps the two from interfering.

const DEP_APP = 'dep-demo';

describe('dependencies', () => {
  it('a blocked card reads as not-yet, and names what it waits on', async () => {
    if (!HAS_CHROMIUM) return;
    must(run(TICKET, ['add', 'the API piece', '--repo', DEP_APP, '--ready'], appDir), 'add blocker');
    must(run(TICKET, ['add', 'the UI piece', '--repo', DEP_APP, '--ready'], appDir), 'add blocked');
    const blocker = idOf('the API piece');
    const blocked = idOf('the UI piece');
    must(run(TICKET, ['dep', blocked, '--blocked-by', blocker], appDir), 'dep');

    const { context, page, errors } = await open('#/r/' + DEP_APP);
    try {
      const card = page.locator('.card[data-tid="' + blocked + '"]');
      await card.waitFor();
      expect(await card.getAttribute('class')).toContain('blocked');
      // The chip sits BESIDE the status, never in place of it: "blocked" is a
      // note about a status, not one of its own, and replacing it made a card
      // stop saying whether it was an idea or ready for as long as it had an edge.
      expect(await card.locator('.chip').innerText()).toBe('blocked by #' + blocker);
      expect(await card.locator('.st').count()).toBe(1);

      // The blocker itself is untouched.
      const other = page.locator('.card[data-tid="' + blocker + '"]');
      expect(await other.getAttribute('class')).not.toContain('blocked');
      expect(errors).toEqual([]);
    } finally { await context.close(); }
  }, T);

  it('the ticket page names both directions and links through', async () => {
    if (!HAS_CHROMIUM) return;
    const blocker = idOf('the API piece');
    const blocked = idOf('the UI piece');
    const { context, page, errors } = await open('#/t/' + blocked);
    try {
      await page.waitForSelector('.stub');
      const by = page.locator('.stub .f', { hasText: 'blocked by' }).first();
      expect(await by.innerText()).toContain('the API piece');
      // The ↗ inside the row navigates to the other ticket without also
      // opening the row's own picker.
      await by.locator('[data-tgo]').first().click();
      await page.waitForFunction((id) => location.hash === '#/t/' + id, blocker);

      // And from the blocker's side, the same edge reads as "blocks".
      const bl = page.locator('.stub .f', { hasText: 'blocks' }).first();
      expect(await bl.innerText()).toContain('the UI piece');
      expect(errors).toEqual([]);
    } finally { await context.close(); }
  }, T);

  it('a cross-app blocker names its app, since it may be off-screen', async () => {
    if (!HAS_CHROMIUM) return;
    must(run(TICKET, ['add', 'a far-off blocker', '--repo', 'other-app', '--ready'], appDir), 'add far');
    const far = idOf('a far-off blocker');
    const blocked = idOf('the UI piece');
    must(run(TICKET, ['dep', blocked, '--blocked-by', far], appDir), 'dep far');

    const { context, page, errors } = await open('#/t/' + blocked);
    try {
      await page.waitForSelector('.stub');
      const by = page.locator('.stub .f', { hasText: 'blocked by' }).first();
      const txt = await by.innerText();
      expect(txt).toContain('a far-off blocker');
      // Small caps by text-transform, and innerText is post-CSS.
      expect(txt).toContain('OTHER-APP');
      // The same-app blocker on the row above carries no app label.
      expect(await by.locator('.dep .far').count()).toBe(1);
      expect(errors).toEqual([]);
    } finally { await context.close(); }
  }, T);

  it('starting blocked work says what is in the way instead of cutting a worktree', async () => {
    if (!HAS_CHROMIUM) return;
    const blocked = idOf('the UI piece');
    const { context, page, errors } = await open('#/t/' + blocked);
    try {
      await page.waitForSelector('[data-act="start"]');
      await page.locator('[data-act="start"]').click();
      // A toast, not a modal: confirm() would block the SSE-driven page it
      // interrupts, and this board already arms delete the same way.
      await page.waitForFunction(() =>
        (document.querySelector('#toast') || {}).textContent?.includes('press again'));
      // Still not started: no branch was cut, which is the thing the refusal
      // exists to prevent. Read from the store rather than the page, since the
      // page is what is under test.
      const t = JSON.parse(run(TICKET, ['show', blocked, '--json'], appDir).stdout);
      expect(t.ticket.branch).toBeNull();
      expect(errors).toEqual([]);
    } finally { await context.close(); }
  }, T);

  it('a landed blocker stops blocking, and the card says freed', async () => {
    if (!HAS_CHROMIUM) return;
    must(run(TICKET, ['done', idOf('the API piece')], appDir), 'ship the blocker');
    must(run(TICKET, ['done', idOf('a far-off blocker')], appDir), 'ship the far blocker');
    const blocked = idOf('the UI piece');

    const { context, page, errors } = await open('#/r/' + DEP_APP);
    try {
      const card = page.locator('.card[data-tid="' + blocked + '"]');
      await card.waitFor();
      expect(await card.getAttribute('class')).not.toContain('blocked');
      expect(await card.locator('.chip.freed').innerText()).toBe('freed');
      // Still says what it IS, as well as that it was freed.
      expect(await card.locator('.st').innerText()).toBe('READY');
      expect(errors).toEqual([]);
    } finally { await context.close(); }
  }, T);

  it('freed work is announced on the board, below the real gates', async () => {
    if (!HAS_CHROMIUM) return;
    const blocked = idOf('the UI piece');
    const { context, page, errors } = await open('');
    try {
      await page.waitForSelector('.wait');
      const row = page.locator('.wait .freedgrp .freedrow[data-tid="' + blocked + '"]');
      expect(await row.count()).toBe(1);
      expect(await row.innerText()).toContain('the UI piece');
      // Subordinate, not equal: the group is drawn AFTER the gates, so a real
      // decision is never buried under a list of suggestions.
      const order = await page.evaluate(() => {
        const w = document.querySelector('.wait');
        return Array.from(w.children).map((c) => c.className);
      });
      const grp = order.findIndex((c) => c.includes('freedgrp'));
      expect(grp).toBe(order.length - 1);
      expect(errors).toEqual([]);
    } finally { await context.close(); }
  }, T);
});

describe('dependency states are about work you could pick up', () => {
  it('a shipped ticket is never drawn as blocked', async () => {
    if (!HAS_CHROMIUM) return;
    // #1 blocks #2, #2 gets shipped anyway (--force is a real path). Finished
    // work must not be painted as work that cannot start, and must keep its
    // own status.
    must(run(TICKET, ['add', 'guard blocker', '--repo', DEP_APP, '--ready'], appDir), 'add');
    must(run(TICKET, ['add', 'guard shipped', '--repo', DEP_APP, '--ready'], appDir), 'add');
    const blocker = idOf('guard blocker');
    const shipped = idOf('guard shipped');
    must(run(TICKET, ['dep', shipped, '--blocked-by', blocker], appDir), 'dep');
    must(run(TICKET, ['done', shipped], appDir), 'done');

    const { context, page, errors } = await open('#/r/' + DEP_APP);
    try {
      await page.keyboard.press('h');            // unfold completed work
      const card = page.locator('.card[data-tid="' + shipped + '"]');
      await card.waitFor();
      expect(await card.getAttribute('class')).not.toContain('blocked');
      expect(await card.locator('.chip').count()).toBe(0);
      // innerText is post-CSS and .st is small caps by text-transform.
      expect(await card.locator('.st').innerText()).toBe('SHIPPED');
      expect(errors).toEqual([]);
    } finally { await context.close(); }
  }, T);

  it('an in-progress ticket is not drawn as blocked', async () => {
    if (!HAS_CHROMIUM) return;
    // Its worktree is already cut, and the CLI checks blockers only on the
    // path that CUTS one. Drawing it blocked would hide a live session's own
    // state behind an edge nothing would act on.
    must(run(TICKET, ['add', 'guard started', '--repo', DEP_APP, '--ready'], appDir), 'add');
    const started = idOf('guard started');
    must(run(TICKET, ['dep', started, '--blocked-by', idOf('guard blocker')], appDir), 'dep');
    // Give it a branch the way `start` would, without cutting a real worktree.
    spawnSync('sqlite3', [join(HOME_DIR, 'factory.db'),
      "UPDATE tickets SET status='in_progress', branch='t-guard' WHERE id=" + started]);

    const { context, page, errors } = await open('#/r/' + DEP_APP);
    try {
      const card = page.locator('.card[data-tid="' + started + '"]');
      await card.waitFor();
      expect(await card.getAttribute('class')).not.toContain('blocked');
      expect(await card.locator('.chip').count()).toBe(0);
      expect(errors).toEqual([]);
    } finally { await context.close(); }
  }, T);

});
