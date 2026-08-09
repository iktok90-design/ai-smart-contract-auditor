#!/usr/bin/env node
/**
 * Render the audit card SVG template to PNG using sharp.
 *
 * Usage:
 *   render-card --findings <path-to-findings.json> [--out <out.png>]
 *                [--style classic|bear|hacker|minimal]
 *
 * `findings.json` shape:
 *   {
 *     target: "MyVault",
 *     address: "0xabc...",
 *     chain: "berachain",
 *     date: "2026-05-13",
 *     grade: "D",
 *     counts: { critical: 1, high: 3, medium: 2, low: 4, info: 7 },
 *     top_finding: "Reentrancy in withdraw() drains the vault",
 *     report_url: "https://iktok90-design.github.io/AuditSentry"
 *   }
 */

import { readFile, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import Handlebars from "handlebars";
import sharp from "sharp";

const here = dirname(fileURLToPath(import.meta.url));
const TEMPLATE_DEFAULT = resolve(here, "..", "..", "templates", "audit-card.svg.hbs");

const GRADE_COLORS: Record<string, string> = {
  "A+": "#3fb950", "A": "#3fb950",
  "B": "#a5d6a7", "C": "#ffc94a",
  "D": "#ff8c42", "E": "#ff4747", "F": "#ff4747",
};

const STYLE_OVERRIDES: Record<string, Record<string, string>> = {
  classic: {},
  bear: { /* could swap accent + add bear emoji */ },
  hacker: { /* could swap to green-on-black */ },
  minimal: { /* could strip to grade only */ },
};

function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const k = a.slice(2);
      const v = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : "true";
      out[k] = v;
    }
  }
  return out;
}

function shorten(addr: string): string {
  if (!addr || addr.length < 12) return addr || "";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.findings) {
    console.error("usage: render-card --findings <path> [--out <out.png>] [--style classic|bear|hacker|minimal]");
    process.exit(1);
  }
  const findingsPath = resolve(args.findings);
  const out = resolve(args.out || "audit-card.png");
  const templatePath = resolve(args.template || TEMPLATE_DEFAULT);
  const style = args.style || "classic";

  const findings = JSON.parse(await readFile(findingsPath, "utf-8"));
  const tpl = await readFile(templatePath, "utf-8");

  const data = {
    target: findings.target ?? "Unknown",
    address: findings.address ? shorten(findings.address) : "",
    chain: findings.chain ?? "—",
    date: findings.date ?? new Date().toISOString().slice(0, 10),
    grade: findings.grade ?? "?",
    grade_color: GRADE_COLORS[findings.grade ?? "?"] ?? "#8b949e",
    counts: {
      critical: findings.counts?.critical ?? 0,
      high: findings.counts?.high ?? 0,
      medium: findings.counts?.medium ?? 0,
      low: findings.counts?.low ?? 0,
      info: findings.counts?.info ?? 0,
    },
    top_finding: findings.top_finding ?? "No findings",
    report_url: findings.report_url ?? "",
    ...(STYLE_OVERRIDES[style] ?? {}),
  };

  const svg = Handlebars.compile(tpl)(data);

  // Sharp can rasterize SVG directly via librsvg.
  await sharp(Buffer.from(svg), { density: 144 })
    .png({ compressionLevel: 9 })
    .resize(1200, 1200)
    .toFile(out);

  console.log(`✓ wrote ${out}  (style: ${style}, grade: ${data.grade})`);
}

main().catch((err) => {
  console.error("render-card failed:", err);
  process.exit(1);
});
