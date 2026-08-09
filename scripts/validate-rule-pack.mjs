#!/usr/bin/env node
// Validate a AuditSentry rule pack: pack.yml metadata + every rule listed must have
// a skills/<rule>/SKILL.md with frontmatter whose `name` matches. Zero-dep.
// Usage: node scripts/validate-rule-pack.mjs rules/<pack-dir>
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

// Minimal parser for the flat `key: value` + `rules:` list shape pack.yml uses.
export function parsePackYml(text) {
  const out = { rules: [] };
  let inRules = false;
  for (const raw of text.split("\n")) {
    const line = raw.replace(/#.*$/, "").trimEnd();
    if (!line.trim()) continue;
    const listItem = line.match(/^\s*-\s+(.+)$/);
    if (inRules && listItem) { out.rules.push(listItem[1].trim()); continue; }
    const kv = line.match(/^([a-z_]+):\s*(.*)$/i);
    if (kv) {
      inRules = kv[1] === "rules";
      if (!inRules) out[kv[1]] = kv[2].replace(/^["']|["']$/g, "");
    }
  }
  return out;
}

export function frontmatterName(md) {
  const m = md.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return null;
  const nm = m[1].match(/^name:\s*(.+)$/m);
  return nm ? nm[1].trim() : null;
}

export function validatePack(packDir) {
  const errors = [];
  const ymlPath = join(packDir, "pack.yml");
  if (!existsSync(ymlPath)) return { ok: false, errors: [`missing pack.yml in ${packDir}`] };

  const meta = parsePackYml(readFileSync(ymlPath, "utf-8"));
  for (const field of ["name", "version", "author", "license", "description"]) {
    if (!meta[field]) errors.push(`pack.yml missing required field: ${field}`);
  }
  if (meta.rules.length === 0) errors.push("pack.yml lists no rules");

  const skillsDir = join(packDir, "skills");
  for (const rule of meta.rules) {
    const skillPath = join(skillsDir, rule, "SKILL.md");
    if (!existsSync(skillPath)) {
      errors.push(`rule "${rule}" listed but skills/${rule}/SKILL.md is missing`);
      continue;
    }
    const name = frontmatterName(readFileSync(skillPath, "utf-8"));
    if (name !== rule) {
      errors.push(`skills/${rule}/SKILL.md frontmatter name "${name}" != rule "${rule}"`);
    }
  }

  // Warn about skill dirs not registered in pack.yml (not a hard error).
  const orphans = existsSync(skillsDir)
    ? readdirSync(skillsDir).filter((d) => existsSync(join(skillsDir, d, "SKILL.md")) && !meta.rules.includes(d))
    : [];

  return { ok: errors.length === 0, errors, meta, orphans };
}

const isEntry = process.argv[1] && process.argv[1].endsWith("validate-rule-pack.mjs");
if (isEntry) {
  const dir = process.argv[2];
  if (!dir) { console.error("usage: validate-rule-pack.mjs <pack-dir>"); process.exit(2); }
  const r = validatePack(dir);
  if (!r.ok) { console.error(`✗ ${dir}:\n  - ${r.errors.join("\n  - ")}`); process.exit(1); }
  console.log(`✓ ${r.meta.name} v${r.meta.version} — ${r.meta.rules.length} rule(s)` +
    (r.orphans.length ? ` (warning: ${r.orphans.length} unregistered skill dir(s): ${r.orphans.join(", ")})` : ""));
}
