#!/usr/bin/env bun
/**
 * skill-check.ts — validate that every {{PLACEHOLDER}} in any SKILL.md.tmpl
 * has a corresponding resolver in lib/resolvers/. Exits non-zero on errors.
 */
import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const RESOLVERS_DIR = join(ROOT, "lib", "resolvers");

const known = new Set<string>();
if (existsSync(RESOLVERS_DIR)) {
  for (const f of readdirSync(RESOLVERS_DIR)) {
    if (!f.endsWith(".md")) continue;
    known.add(f.replace(/\.md$/, "").toUpperCase().replace(/-/g, "_"));
  }
}

const errors: string[] = [];
for (const d of readdirSync(ROOT)) {
  if (d.startsWith(".")) continue;
  const p = join(ROOT, d);
  if (!statSync(p).isDirectory()) continue;
  const tmpl = join(p, "SKILL.md.tmpl");
  if (!existsSync(tmpl)) continue;
  const content = readFileSync(tmpl, "utf8");
  for (const m of content.matchAll(/\{\{([A-Z_]+)\}\}/g)) {
    if (!known.has(m[1])) {
      errors.push(`${d}/SKILL.md.tmpl: unknown placeholder {{${m[1]}}}`);
    }
  }
}

if (errors.length > 0) {
  console.error("skill-check failed:");
  for (const e of errors) console.error("  - " + e);
  process.exit(1);
}
console.log(`skill-check ok (${known.size} resolvers known).`);
