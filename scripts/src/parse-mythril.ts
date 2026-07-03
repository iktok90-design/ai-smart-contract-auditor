#!/usr/bin/env node
/**
 * Parse Mythril's JSON output (myth analyze -o json) into AuditSentry finding shape.
 *
 * Usage:
 *   myth analyze <file> -o json | node scripts/dist/parse-mythril.js
 *   parse-mythril --in mythril.json --out findings.json
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

const MYTHRIL_TO_RUGPROOF_SEVERITY: Record<string, string> = {
  "High": "Critical",
  "Medium": "High",
  "Low": "Medium",
  "Informational": "Low",
};

const SWC_TO_VULN: Record<string, string> = {
  "SWC-101": "integer-issues",
  "SWC-104": "unchecked-calls",
  "SWC-105": "access-control",
  "SWC-106": "selfdestruct-eip6780",
  "SWC-107": "reentrancy",
  "SWC-108": "storage-layout",
  "SWC-109": "initialization",
  "SWC-110": "integer-issues",
  "SWC-111": "pragma-and-addresses",
  "SWC-112": "delegatecall-risks",
  "SWC-114": "tx-context-misuse",
  "SWC-115": "tx-context-misuse",
  "SWC-116": "tx-context-misuse",
  "SWC-117": "signature-replay",
  "SWC-118": "initialization",
  "SWC-119": "storage-layout",
  "SWC-120": "tx-context-misuse",
  "SWC-121": "signature-replay",
  "SWC-128": "dos-vectors",
  "SWC-132": "approval-issues",
  "SWC-133": "centralization-risk",
  "SWC-134": "tx-context-misuse",
  "SWC-135": "unchecked-calls",
  "SWC-136": "unchecked-calls",
};

async function readInput(path?: string): Promise<any> {
  if (path) return JSON.parse(await readFile(resolve(path), "utf-8"));
  return new Promise((res, rej) => {
    let buf = "";
    process.stdin.setEncoding("utf-8");
    process.stdin.on("data", (c) => (buf += c));
    process.stdin.on("end", () => { try { res(JSON.parse(buf)); } catch (e) { rej(e); } });
    process.stdin.on("error", rej);
  });
}

export function normalize(myth: any) {
  const issues = myth?.issues ?? [];
  const findings = issues.map((iss: any, idx: number) => {
    const sev = MYTHRIL_TO_RUGPROOF_SEVERITY[iss.severity] ?? "Info";
    const swc = iss["swc-id"] ?? iss.swcID ?? "";
    const swcKey = swc ? `SWC-${swc.replace(/^SWC-?/i, "")}` : "";
    const vuln = SWC_TO_VULN[swcKey] ?? "general";
    return {
      id: `MYTHRIL-${swcKey || "GEN"}-${String(idx + 1).padStart(3, "0")}`,
      severity: sev,
      confidence: "MEDIUM",
      title: iss.title ?? swcKey,
      pattern: vuln,
      path: iss.filename ?? "unknown",
      line: iss.lineno ?? 0,
      summary: (iss.description?.head ?? iss.description ?? "").toString().trim().split("\n")[0],
      code: iss.code ?? "",
      impact: iss.severity ?? "",
      likelihood: "Symbolic exec found a reachable path",
      recommendation: `See SWC: https://swcregistry.io/docs/${swcKey}`,
      diff: "",
      references: [`SWC: ${swcKey}`, `Mythril detector: ${iss.title}`],
      _mythril_raw: { swc: swcKey, severity: iss.severity, function: iss.function },
    };
  });

  const counts = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  findings.forEach((f: any) => {
    const k = f.severity.toLowerCase() as keyof typeof counts;
    if (k in counts) counts[k]++;
  });

  return {
    source: "mythril",
    target: issues[0]?.filename ?? "unknown",
    date: new Date().toISOString().slice(0, 10),
    counts,
    grade: pickGrade(counts),
    findings,
  };
}

export function pickGrade(c: Record<string, number>): string {
  if (c.critical > 0) return "F";
  if (c.high > 2) return "D";
  if (c.high > 0) return "C";
  if (c.medium > 2) return "B";
  return "A";
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const input = await readInput(args.in);
  const out = normalize(input);
  if (args.out) {
    await writeFile(resolve(args.out), JSON.stringify(out, null, 2), "utf-8");
    console.log(`✓ wrote ${args.out} — ${out.findings.length} finding(s) (grade ${out.grade})`);
  } else {
    process.stdout.write(JSON.stringify(out, null, 2));
  }
}

const isEntry = !!process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isEntry) {
  main().catch((err) => { console.error("parse-mythril failed:", err); process.exit(1); });
}
