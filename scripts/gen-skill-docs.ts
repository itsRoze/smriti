#!/usr/bin/env bun
/**
 * gen-skill-docs.ts — expand <skill>/SKILL.md.tmpl → <skill>/SKILL.md
 *
 * Each `{{PLACEHOLDER}}` resolves to the contents of
 * `lib/resolvers/<placeholder-lowercased-with-dashes>.md`.
 * Example: `{{CODEX_SECOND_OPINION}}` → `lib/resolvers/codex-second-opinion.md`.
 *
 * The generated SKILL.md gets a banner inserted after the YAML frontmatter so
 * it's obvious regenerated files shouldn't be hand-edited.
 */
import { readdirSync, readFileSync, writeFileSync, existsSync, statSync, rmSync, rmdirSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const RESOLVERS_DIR = join(ROOT, "lib", "resolvers");
const BANNER =
  "<!-- AUTO-GENERATED from SKILL.md.tmpl — run `bun run gen:skill-docs` to regenerate; do not edit by hand -->";

function loadResolvers(): Record<string, string> {
  const map: Record<string, string> = {};
  if (!existsSync(RESOLVERS_DIR)) return map;
  for (const entry of readdirSync(RESOLVERS_DIR)) {
    if (!entry.endsWith(".md")) continue;
    const name = entry.replace(/\.md$/, "").toUpperCase().replace(/-/g, "_");
    map[name] = readFileSync(join(RESOLVERS_DIR, entry), "utf8").replace(/\n+$/, "");
  }
  return map;
}

function expand(input: string, resolvers: Record<string, string>, label: string): string {
  return input.replace(/\{\{([A-Z_]+)\}\}/g, (_match, name) => {
    if (!(name in resolvers)) {
      const expectedFile = name.toLowerCase().replace(/_/g, "-") + ".md";
      throw new Error(`${label}: unknown placeholder {{${name}}} (expected lib/resolvers/${expectedFile})`);
    }
    return resolvers[name];
  });
}

function findSkillTemplates(): string[] {
  return readdirSync(ROOT).filter((d) => {
    if (d.startsWith(".")) return false;
    const p = join(ROOT, d);
    return statSync(p).isDirectory() && existsSync(join(p, "SKILL.md.tmpl"));
  });
}

// A generated SKILL.md whose .tmpl is gone is stale output, not a skill. It is
// gitignored, so deleting the template does not delete it — the directory survives
// the pull and setup would register a skill the repo has retired. Sweeping it here
// keeps generation the single owner of what it wrote.
function sweepOrphanedDocs(): string[] {
  const swept: string[] = [];
  for (const d of readdirSync(ROOT)) {
    if (d.startsWith(".")) continue;
    const dir = join(ROOT, d);
    if (!statSync(dir).isDirectory()) continue;
    if (existsSync(join(dir, "SKILL.md.tmpl"))) continue;
    if (!existsSync(join(dir, "SKILL.md"))) continue;
    rmSync(join(dir, "SKILL.md"));
    swept.push(d);
    // Only succeeds when nothing else is left, which is exactly when we want it.
    try { rmdirSync(dir); } catch { /* dir still has content — leave it */ }
  }
  return swept;
}

function insertBanner(content: string): string {
  if (content.startsWith("---\n")) {
    const end = content.indexOf("\n---\n", 4);
    if (end !== -1) {
      const cut = end + "\n---\n".length;
      return content.slice(0, cut) + BANNER + "\n" + content.slice(cut);
    }
  }
  return BANNER + "\n" + content;
}

function main(): void {
  const resolvers = loadResolvers();
  for (const stale of sweepOrphanedDocs()) console.log(`  ✗ ${stale}/SKILL.md (retired — template gone)`);
  const skills = findSkillTemplates();

  if (skills.length === 0) {
    console.log("no SKILL.md.tmpl files found — nothing to generate.");
    return;
  }

  let count = 0;
  for (const skill of skills) {
    const tmpl = readFileSync(join(ROOT, skill, "SKILL.md.tmpl"), "utf8");
    const out = insertBanner(expand(tmpl, resolvers, `${skill}/SKILL.md.tmpl`));
    writeFileSync(join(ROOT, skill, "SKILL.md"), out);
    console.log(`  ✓ ${skill}/SKILL.md`);
    count++;
  }
  console.log(`generated ${count} skill doc(s).`);
}

main();
