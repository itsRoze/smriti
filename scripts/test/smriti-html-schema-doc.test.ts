// D4 schema-drift guard: the spec/payload examples documented in the resolver
// (lib/resolvers/html-render.md) must validate against the CANONICAL schema in
// bin/smriti-html. If someone edits the doc's examples to drift from the code,
// this test fails — instead of the drift surfacing at runtime in a consumer.

import { test, expect } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const REPO_ROOT = join(import.meta.dir, '..', '..');
const HTML = join(REPO_ROOT, 'bin', 'smriti-html');
const RESOLVER = join(REPO_ROOT, 'lib', 'resolvers', 'html-render.md');

// Pull the ```json block that immediately follows a `<!-- example:NAME -->` marker.
function exampleBlock(md: string, name: string): string {
  const marker = md.indexOf(`<!-- example:${name} -->`);
  if (marker === -1) throw new Error(`marker example:${name} not found in resolver`);
  const fence = md.indexOf('```json', marker);
  const start = md.indexOf('\n', fence) + 1;
  const end = md.indexOf('```', start);
  return md.slice(start, end).trim();
}

test('resolver example spec + payload validate against the canonical schema (D4)', () => {
  const md = readFileSync(RESOLVER, 'utf8');
  const specText = exampleBlock(md, 'spec');
  const payloadText = exampleBlock(md, 'payload');

  // Both parse as JSON.
  const spec = JSON.parse(specText);
  JSON.parse(payloadText);

  const dir = mkdtempSync(join(tmpdir(), 'smriti-html-doc-'));
  try {
    const specPath = join(dir, 'spec.json');
    const payloadPath = join(dir, 'payload.json');
    writeFileSync(specPath, specText);
    writeFileSync(payloadPath, payloadText);

    // Spec validates.
    const specRes = spawnSync('bun', [HTML, 'check-spec', specPath], { encoding: 'utf8' });
    expect(specRes.status).toBe(0);

    // Payload validates AND every decision references a real card id in the spec.
    const payRes = spawnSync('bun', [HTML, 'check-payload', payloadPath, '--spec', specPath], { encoding: 'utf8' });
    expect(payRes.status).toBe(0);
    expect(payRes.stdout).toContain('"ok":true');

    // Sanity: the example actually exercises the schema (decisions reference the spec's cards).
    const ids = new Set<string>();
    for (const s of spec.sections) for (const c of s.cards) ids.add(c.id);
    expect(ids.size).toBeGreaterThan(0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
