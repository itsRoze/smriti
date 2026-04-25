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
import { readdirSync, readFileSync, writeFileSync, existsSync, statSync } from "node:fs";
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
