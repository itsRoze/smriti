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

      // Saving an unchanged body must not write at all. Counting the PATCH is
      // the only honest way to assert that — reading the store back would pass
      // whether or not a request was sent, since the value is identical either
      // way. (The changed-body write-back is covered by the cancel test.)
      let patches = 0;
      page.on('request', (req) => {
        if (req.method() === 'PATCH' && req.url().includes('/api/tickets/')) patches++;
      });
      await page.locator('#descedit').press('Meta+Enter');
      await page.waitForSelector('#desc.md');
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

      // The selection has to come from the keyboard: the global Enter branch
      // is `if (detailId && selectedTicket())`, so opening the overlay with a
      // mouse click leaves sel at -1 and the bug cannot show itself.
      await page.keyboard.press('ArrowDown');
      await page.waitForSelector('.sel');
      await page.keyboard.press('Enter');
      await page.waitForSelector('#detv.on');

      // The description is tabbable now, and Escape from its editor focuses it.
      // With the overlay open the GLOBAL Enter means "start this ticket", so
      // the element handler has to stop the event, not merely preventDefault.
      await page.keyboard.press('e');
      await page.waitForSelector('#descedit.on');
      await page.locator('#descedit').press('Escape');
      await page.waitForSelector('#descedit.on', { state: 'hidden' });
      expect(await page.evaluate(() => document.activeElement?.id)).toBe('desc');

      await page.keyboard.press('Enter');
      await page.waitForSelector('#descedit.on');
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
      await page.waitForSelector('#descedit.on');
      // The property worth pinning is not a pixel count, it is "you can see
      // what you are typing": no inner scrollbar, so the whole body is visible
      // without scrolling inside a six-line letterbox.
      const { clientH, scrollH, capped } = await page.evaluate(() => {
        const ta = document.querySelector('#descedit') as HTMLTextAreaElement;
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
      // Armed BEFORE the click: the render fires as the overlay opens, so
      // registering the wait afterwards races the request and hangs.
      const rendered = page.waitForResponse((r) => r.url().includes('/api/render'));
      await page.locator('.card[data-tid="' + MD_TICKET + '"]').click();
      await page.waitForSelector('#detv.on');
      await rendered;
      // A settle only AFTER a confirmed response. The negative assertion below
      // needs the client's continuation to have run; what it must not do is
      // bet on the response arriving at all, which is what a bare sleep does.
      await page.waitForTimeout(100);

      expect(await page.locator('#desc.raw').count()).toBe(1);
      expect(await page.locator('#desc').innerText()).toContain('the first paragraph.');
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

      // Wait on the RESPONSE, not a sleep. A timeout here would let the test
      // pass because the render never arrived — i.e. it would stay green with
      // the guard deleted, which is the one thing it exists to catch.
      const landed = page.waitForResponse((r) => r.url().includes('/api/render'));
      release();
      await landed;
      // Settle only after the response is known to have arrived — see the
      // empty-render test for why that is not the same as sleeping and hoping.
      await page.waitForTimeout(100);

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

      // The overlay carries the same click-through, chosen by an explicit
      // "awaiting with a live URL" predicate rather than by whichever run a
      // bare find() happens to reach first.
      const btn = page.locator('#detv .acts a:has-text("open the plan")');
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
      const bar = (await page.locator('.keys').innerText()).toLowerCase();
      expect(bar).not.toContain('margin');
      expect(bar).not.toContain('completed');
      expect(await page.locator('.keys .k[data-k="b"]').count()).toBe(0);
      expect(await page.locator('.keys .k[data-k="h"]').count()).toBe(0);

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
    const tickets = JSON.parse(run(TICKET, ['list', '--all', '--json'], appDir).stdout) as
      { id: number; title: string }[];
    const tid = tickets.find((t) => t.title === title)!.id;
    const uid = run(TRACE, ['start', 'begin', '--ticket', String(tid)], appDir).stdout.trim().split('=')[1];
    run(TRACE, ['emit', 'plan', 'ok', '--run', uid], appDir);
    run(TRACE, ['emit', 'implement', 'ok', '--run', uid], appDir);
    expect(report(uid, body, source).status).toBe(0);
    run(TRACE, ['end', '--run', uid], appDir);
    return tid;
  }

  async function openRunBody(page: import('playwright').Page, tid: number) {
    await page.locator('.card[data-tid="' + tid + '"]').first().click();
    await page.waitForSelector('#detv.on');
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
      // Folded by default, so a scrape cannot become a wall of text.
      expect(await page.locator('#runs .rep .raw').isVisible()).toBe(false);
      await page.locator('#runs .rep .fold').click();
      expect(await page.locator('#runs .rep .raw').isVisible()).toBe(true);
      expect(await page.locator('#runs .rep .raw').innerText()).toContain('noise from a spinner');
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
      await page.locator('#runs .rep .fold').click();
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
