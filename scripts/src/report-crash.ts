#!/usr/bin/env node
/**
 * Opt-in crash reporting. Off by default. Reads `.auditsentry.yml` `telemetry.crash_reports: true`.
 * Sends only an anonymized stack-trace shape + plugin version + OS.
 */

import { readFile } from "node:fs/promises";
import { platform, release } from "node:os";

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

function anonymizeStack(stack: string): string {
  // Strip absolute paths, keep file basenames + line/col.
  return stack
    .split("\n")
    .map((line) => line.replace(/\(.+\/([^/)]+:\d+:\d+)\)/g, "($1)")
                       .replace(/at [^ ]+\/([^/]+:\d+:\d+)/g, "at $1"))
    .join("\n");
}

async function shouldSend(): Promise<boolean> {
  if (process.env.RUGPROOF_OFFLINE === "1") return false;
  if (process.env.RUGPROOF_PRIVACY === "1") return false;
  try {
    const cfg = await readFile(".auditsentry.yml", "utf-8");
    return /telemetry:[\s\S]*?crash_reports:\s*true/.test(cfg);
  } catch {
    return false;
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!(await shouldSend())) return;
  const url = process.env.RUGPROOF_CRASH_URL;
  if (!url) return;
  const payload = {
    plugin_version: args.version ?? "unknown",
    command: args.command ?? "unknown",
    error_class: args["error-class"] ?? "Error",
    stack: args.stack ? anonymizeStack(args.stack) : "",
    os: platform(),
    os_release: release(),
    node: process.version,
    ts: new Date().toISOString(),
  };
  try {
    await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    // Never break the user's flow.
  }
}

main().catch(() => { /* swallow */ });
