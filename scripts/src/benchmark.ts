#!/usr/bin/env node
/**
 * Score AuditSentry's detection against a labeled corpus (bench/expected.json).
 * For each target, compares the SET of vulnerability `pattern`s an audit found
 * against the expected set → precision / recall / F1, plus a grade check.
 *
 * Usage:
 *   benchmark --expected bench/expected.json --findings <dir-of-*.json>
 *
 * Each findings file is a AuditSentry report (schemas/finding.schema.json) named
 * <Target>.json (matching a key in expected.targets).
 */

import { readFile, readdir } from "node:fs/promises";
import { resolve, join, basename } from "node:path";
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

export interface TargetScore {
  target: string;
  expected: string[];
  found: string[];
  truePositives: string[];
  falsePositives: string[];
  missed: string[];
  precision: number;
  recall: number;
  f1: number;
}

export interface BenchmarkResult {
  perTarget: TargetScore[];
  aggregate: { precision: number; recall: number; f1: number; targets: number };
}

const f1 = (p: number, r: number) => (p + r === 0 ? 0 : (2 * p * r) / (p + r));

/**
 * @param expected   the parsed bench/expected.json `targets` map
 * @param actual     map of target name → array of finding `pattern` strings
 */
export function scoreBenchmark(
  expected: Record<string, { expected_patterns: string[] }>,
  actual: Record<string, string[]>,
): BenchmarkResult {
  const perTarget: TargetScore[] = [];

  for (const [target, spec] of Object.entries(expected)) {
    const exp = new Set(spec.expected_patterns);
    const found = new Set(actual[target] ?? []);
    const truePositives = [...found].filter((p) => exp.has(p));
    const falsePositives = [...found].filter((p) => !exp.has(p));
    const missed = [...exp].filter((p) => !found.has(p));
    const precision = found.size === 0 ? (exp.size === 0 ? 1 : 0) : truePositives.length / found.size;
    const recall = exp.size === 0 ? 1 : truePositives.length / exp.size;
    perTarget.push({
      target,
      expected: [...exp],
      found: [...found],
      truePositives,
      falsePositives,
      missed,
      precision,
      recall,
      f1: f1(precision, recall),
    });
  }

  const n = perTarget.length || 1;
  const avg = (sel: (t: TargetScore) => number) => perTarget.reduce((s, t) => s + sel(t), 0) / n;
  const precision = avg((t) => t.precision);
  const recall = avg((t) => t.recall);
  return {
    perTarget,
    aggregate: { precision, recall, f1: f1(precision, recall), targets: perTarget.length },
  };
}

function patternsOf(report: any): string[] {
  return Array.from(new Set((report?.findings ?? []).map((x: any) => x.pattern).filter(Boolean)));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const expectedPath = args.expected ?? "bench/expected.json";
  const expected = JSON.parse(await readFile(resolve(expectedPath), "utf-8")).targets;

  const actual: Record<string, string[]> = {};
  if (args.findings) {
    const dir = resolve(args.findings);
    for (const f of await readdir(dir)) {
      if (!f.endsWith(".json")) continue;
      const target = basename(f, ".json");
      actual[target] = patternsOf(JSON.parse(await readFile(join(dir, f), "utf-8")));
    }
  }

  const result = scoreBenchmark(expected, actual);
  const pct = (x: number) => (x * 100).toFixed(1) + "%";
  console.log(`\nAuditSentry benchmark — ${result.aggregate.targets} target(s)\n`);
  for (const t of result.perTarget) {
    console.log(`  ${t.target.padEnd(22)} recall ${pct(t.recall).padStart(6)}  precision ${pct(t.precision).padStart(6)}` +
      (t.missed.length ? `   missed: ${t.missed.join(", ")}` : ""));
  }
  console.log(`\n  AGGREGATE  recall ${pct(result.aggregate.recall)}  precision ${pct(result.aggregate.precision)}  F1 ${pct(result.aggregate.f1)}\n`);
  if (args.out) await (await import("node:fs/promises")).writeFile(resolve(args.out), JSON.stringify(result, null, 2));
}

const isEntry = !!process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isEntry) {
  main().catch((err) => { console.error("benchmark failed:", err); process.exit(1); });
}
