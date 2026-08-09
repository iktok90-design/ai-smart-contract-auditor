#!/usr/bin/env node
/**
 * Opt-in usage telemetry. Off by default. Reads `.auditsentry.yml` `telemetry.enabled: true`.
 *
 * Sends only:
 *   - Plugin version
 *   - Command name (NOT arguments)
 *   - Anonymous install id (random UUID stored at ~/.config/auditsentry/install-id)
 *   - OS + node version
 *   - Outcome (success/failure)
 *
 * Never sent:
 *   - File contents
 *   - File paths beyond extension
 *   - Findings detail
 *   - Contract source
 *   - Addresses
 *
 * Endpoint: $RUGPROOF_TELEMETRY_URL or default (which is intentionally unset until launch)
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir, platform, release } from "node:os";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";

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

async function getInstallId(): Promise<string> {
  const dir = resolve(homedir(), ".config", "auditsentry");
  const file = resolve(dir, "install-id");
  try {
    return (await readFile(file, "utf-8")).trim();
  } catch {
    await mkdir(dir, { recursive: true });
    const id = randomUUID();
    await writeFile(file, id, "utf-8");
    return id;
  }
}

async function isOptedIn(): Promise<boolean> {
  if (process.env.RUGPROOF_OFFLINE === "1") return false;
  if (process.env.RUGPROOF_PRIVACY === "1") return false;
  try {
    const cfg = await readFile(".auditsentry.yml", "utf-8");
    return /telemetry:[\s\S]*?enabled:\s*true/.test(cfg);
  } catch {
    return false;
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!(await isOptedIn())) {
    return;   // silent no-op
  }
  const url = process.env.RUGPROOF_TELEMETRY_URL;
  if (!url) {
    return;   // no endpoint configured; no-op
  }
  const payload = {
    install_id: await getInstallId(),
    plugin_version: args.version ?? "unknown",
    command: args.command ?? "unknown",
    outcome: args.outcome ?? "unknown",
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
    // Telemetry must never break the user's workflow.
  }
}

main().catch(() => { /* swallow */ });
