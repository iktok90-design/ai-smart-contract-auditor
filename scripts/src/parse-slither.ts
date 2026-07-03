#!/usr/bin/env node
/**
 * Parse Slither's --json output into AuditSentry's normalized finding shape.
 *
 * Usage:
 *   slither <target> --json - | node scripts/dist/parse-slither.js
 *   parse-slither --in slither.json --out findings.json
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

const SLITHER_TO_RUGPROOF_SEVERITY: Record<string, string> = {
  "High": "Critical",
  "Medium": "High",
  "Low": "Medium",
  "Informational": "Low",
  "Optimization": "Info",
};

const SLITHER_DETECTOR_TO_VULN: Record<string, string> = {
  "reentrancy-eth": "reentrancy",
  "reentrancy-no-eth": "reentrancy",
  "reentrancy-benign": "reentrancy",
  "reentrancy-events": "reentrancy",
  "uninitialized-state": "initialization",
  "uninitialized-storage": "storage-layout",
  "arbitrary-send-eth": "access-control",
  "controlled-delegatecall": "delegatecall-risks",
  "delegatecall-loop": "delegatecall-risks",
  "tx-origin": "tx-context-misuse",
  "weak-prng": "tx-context-misuse",
  "incorrect-equality": "integer-issues",
  "divide-before-multiply": "integer-issues",
  "unchecked-transfer": "unchecked-calls",
  "unchecked-send": "unchecked-calls",
  "unused-return": "unchecked-calls",
  "low-level-calls": "unchecked-calls",
  "missing-zero-check": "pragma-and-addresses",
  "solc-version": "pragma-and-addresses",
  "incorrect-modifier": "access-control",
  "uninitialized-local": "initialization",
  "shadowing-state": "storage-layout",
  "suicidal": "selfdestruct-eip6780",
};

async function readInput(path?: string): Promise<any> {
  if (path) {
    return JSON.parse(await readFile(resolve(path), "utf-8"));
  }
  // Read stdin
  return new Promise((res, rej) => {
    let buf = "";
    process.stdin.setEncoding("utf-8");
    process.stdin.on("data", (c) => (buf += c));
    process.stdin.on("end", () => {
      try { res(JSON.parse(buf)); } catch (e) { rej(e); }
    });
    process.stdin.on("error", rej);
  });
}

export function normalize(slither: any) {
  const detectors = slither?.results?.detectors ?? [];
  const findings = detectors.map((d: any, idx: number) => {
    const sev = SLITHER_TO_RUGPROOF_SEVERITY[d.impact] ?? "Info";
    const vuln = SLITHER_DETECTOR_TO_VULN[d.check] ?? "general";
    const elem = d.elements?.[0];
    const sourceMap = elem?.source_mapping ?? {};
    const path = sourceMap.filename_short ?? sourceMap.filename_relative ?? "unknown";
    const line = (sourceMap.lines && sourceMap.lines[0]) ?? 0;
    const idShort = d.check.toUpperCase().replace(/-/g, "_").slice(0, 12);
    return {
      id: `SLITHER-${idShort}-${String(idx + 1).padStart(3, "0")}`,
      severity: sev,
      confidence: confidenceMap(d.confidence),
      title: d.check.replace(/-/g, " "),
      pattern: vuln,
      path, line,
      summary: (d.description ?? "").trim().split("\n")[0],
      code: "",
      impact: d.impact ?? "",
      likelihood: d.confidence ?? "",
      recommendation: `See Slither docs: https://github.com/crytic/slither/wiki/Detector-Documentation#${d.check}`,
      diff: "",
      references: [`Slither detector: ${d.check}`],
      _slither_raw: { check: d.check, impact: d.impact, confidence: d.confidence },
    };
  });

  const counts = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  findings.forEach((f: any) => {
    const k = f.severity.toLowerCase() as keyof typeof counts;
    if (k in counts) counts[k]++;
  });

  return {
    source: "slither",
    target: detectors[0]?.elements?.[0]?.source_mapping?.filename_relative ?? "unknown",
    date: new Date().toISOString().slice(0, 10),
    counts,
    grade: pickGrade(counts),
    findings,
  };
}

function confidenceMap(c: string): string {
  return ({ High: "HIGH", Medium: "MEDIUM", Low: "LOW" } as Record<string, string>)[c] ?? "MEDIUM";
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
  main().catch((err) => { console.error("parse-slither failed:", err); process.exit(1); });
}
