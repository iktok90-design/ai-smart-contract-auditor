#!/usr/bin/env node
// Assert every version-bearing manifest agrees and the CHANGELOG documents that
// version. Run from the repo root: `node scripts/check-versions.mjs`.
// Exits non-zero (and prints why) on any mismatch — used as a CI/release gate.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(resolve(ROOT, p), "utf-8");
const readJson = (p) => JSON.parse(read(p));

const sources = {
  "plugin.json": readJson(".claude-plugin/plugin.json").version,
  "marketplace.json": readJson(".claude-plugin/marketplace.json").plugins[0].version,
  "mcp/package.json": readJson("mcp/package.json").version,
  "scripts/package.json": readJson("scripts/package.json").version,
};

const versions = [...new Set(Object.values(sources))];
const problems = [];

if (versions.length !== 1) {
  problems.push(
    "version mismatch across manifests:\n" +
      Object.entries(sources).map(([k, v]) => `    ${k.padEnd(24)} ${v}`).join("\n"),
  );
}

const version = sources["plugin.json"];
const changelog = read("CHANGELOG.md");
if (!changelog.includes(`## [${version}]`)) {
  problems.push(`CHANGELOG.md has no "## [${version}]" section`);
}

if (problems.length) {
  console.error("✗ version check failed:\n  - " + problems.join("\n  - "));
  process.exit(1);
}
console.log(`✓ versions agree: ${version} (and CHANGELOG documents it)`);
