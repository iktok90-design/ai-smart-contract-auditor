#!/usr/bin/env node
/**
 * Turn a AuditSentry finding + program metadata into a bug-bounty submission
 * (Immunefi-style JSON payload + a human Markdown report). Pure formatting — the
 * actual POST (which needs IMMUNEFI_API_KEY) happens in /bounty-submit.
 *
 * Usage:
 *   format-bounty --finding finding.json --program program.json [--poc test/Exploit.t.sol] [--out sub.json]
 */

import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

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

export interface Finding {
  id: string; severity: string; title: string;
  path?: string; line?: number; summary?: string; recommendation?: string;
}
export interface Program {
  protocol: string; chain: string; address: string;
  platform?: string; program_slug?: string;
  severity_map?: Record<string, string>;
  implementation?: string;
}

export interface BountySubmission {
  title: string;
  severity: string;
  platform: string;
  program_slug: string;
  asset: { chain: string; address: string; implementation?: string };
  json: Record<string, unknown>;
  markdown: string;
}

export function formatBountySubmission(finding: Finding, program: Program, pocSource?: string): BountySubmission {
  const platform = program.platform ?? "immunefi";
  const mappedSeverity = program.severity_map?.[finding.severity] ?? finding.severity.toLowerCase();
  const title = `[${finding.severity}] ${finding.title}`;
  const asset = { chain: program.chain, address: program.address, implementation: program.implementation };

  const markdown = [
    `# ${title}`,
    "",
    `**Severity:** ${mappedSeverity}`,
    `**Protocol:** ${program.protocol}`,
    `**Affected asset:** \`${program.address}\` on ${program.chain}` +
      (program.implementation ? ` (implementation \`${program.implementation}\`)` : ""),
    finding.path ? `**Location:** \`${finding.path}${finding.line ? ":" + finding.line : ""}\`` : "",
    "",
    "## Description",
    finding.summary ?? "(describe the vulnerability)",
    "",
    "## Proof of concept",
    pocSource ? "```solidity\n" + pocSource.trim() + "\n```" : "_Attach the passing Foundry PoC from `/exploit-live`._",
    "",
    "## Recommended mitigation",
    finding.recommendation ?? "(see /remediate)",
    "",
    "## Disclosure",
    "Reported via AuditSentry. Please coordinate a fix before public disclosure (90-day standard window).",
  ].filter((l) => l !== "").join("\n");

  const json = {
    program_slug: program.program_slug ?? program.protocol.toLowerCase().replace(/\s+/g, "-"),
    title,
    severity: mappedSeverity,
    asset,
    finding_id: finding.id,
    body_markdown: markdown,
  };

  return {
    title, severity: mappedSeverity, platform,
    program_slug: json.program_slug, asset, json, markdown,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.finding || !args.program) {
    console.error("usage: format-bounty --finding finding.json --program program.json [--poc file] [--out sub.json]");
    process.exit(2);
  }
  const finding = JSON.parse(await readFile(resolve(args.finding), "utf-8"));
  const program = JSON.parse(await readFile(resolve(args.program), "utf-8"));
  const poc = args.poc ? await readFile(resolve(args.poc), "utf-8") : undefined;
  const sub = formatBountySubmission(finding, program, poc);
  if (args.out) {
    await writeFile(resolve(args.out), JSON.stringify(sub.json, null, 2), "utf-8");
    console.log(`✓ wrote ${args.out} — ${sub.title} (${sub.platform}/${sub.program_slug})`);
  } else {
    process.stdout.write(sub.markdown + "\n");
  }
}

const isEntry = !!process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isEntry) {
  main().catch((err) => { console.error("format-bounty failed:", err); process.exit(1); });
}
