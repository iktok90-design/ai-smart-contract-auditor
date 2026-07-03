#!/usr/bin/env node
/**
 * Diff two AuditSentry report JSONs (the schemas/finding.schema.json shape) to
 * track regressions between audits: which findings are new, which were fixed,
 * which persist, and how the grade / severity counts moved.
 *
 * Usage:
 *   diff-reports --old before.json --new after.json
 *   diff-reports --old before.json --new after.json --out delta.json
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

const SEV_ORDER = ["info", "low", "medium", "high", "critical"];

interface Finding { id: string; severity: string; title?: string; path?: string; line?: number; }
interface Report { grade?: string; counts?: Record<string, number>; findings?: Finding[]; }

export interface ReportDiff {
  added: Finding[];
  fixed: Finding[];
  persisting: Finding[];
  countsDelta: Record<string, number>;
  gradeChange: { from: string; to: string };
  regressed: boolean;       // any new High/Critical introduced
  improved: boolean;        // findings fixed and none introduced at >= the worst fixed severity
  summary: string;
}

const sevRank = (s: string) => SEV_ORDER.indexOf((s || "info").toLowerCase());

export function diffReports(oldR: Report, newR: Report): ReportDiff {
  const oldF = oldR.findings ?? [];
  const newF = newR.findings ?? [];
  const oldById = new Map(oldF.map((f) => [f.id, f]));
  const newById = new Map(newF.map((f) => [f.id, f]));

  const added = newF.filter((f) => !oldById.has(f.id));
  const fixed = oldF.filter((f) => !newById.has(f.id));
  const persisting = newF.filter((f) => oldById.has(f.id));

  const countsDelta: Record<string, number> = {};
  for (const k of ["critical", "high", "medium", "low", "info"]) {
    countsDelta[k] = (newR.counts?.[k] ?? 0) - (oldR.counts?.[k] ?? 0);
  }

  const regressed = added.some((f) => sevRank(f.severity) >= sevRank("high"));
  const improved = fixed.length > 0 && !regressed;

  const gradeChange = { from: oldR.grade ?? "?", to: newR.grade ?? "?" };

  const summary =
    `${added.length} new, ${fixed.length} fixed, ${persisting.length} persisting · ` +
    `grade ${gradeChange.from} → ${gradeChange.to}` +
    (regressed ? " · ⚠ REGRESSION (new high/critical)" : improved ? " · ✓ improved" : "");

  return { added, fixed, persisting, countsDelta, gradeChange, regressed, improved, summary };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.old || !args.new) {
    console.error("usage: diff-reports --old before.json --new after.json [--out delta.json]");
    process.exit(2);
  }
  const oldR = JSON.parse(await readFile(resolve(args.old), "utf-8"));
  const newR = JSON.parse(await readFile(resolve(args.new), "utf-8"));
  const diff = diffReports(oldR, newR);
  if (args.out) {
    await writeFile(resolve(args.out), JSON.stringify(diff, null, 2), "utf-8");
    console.log(`✓ wrote ${args.out} — ${diff.summary}`);
  } else {
    process.stdout.write(JSON.stringify(diff, null, 2));
  }
  // Non-zero exit on regression so this is CI-usable as a gate.
  if (diff.regressed) process.exit(1);
}

const isEntry = !!process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isEntry) {
  main().catch((err) => { console.error("diff-reports failed:", err); process.exit(1); });
}
