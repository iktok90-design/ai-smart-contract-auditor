#!/usr/bin/env node
/**
 * Check whether a newer AuditSentry release is available on GitHub.
 * Reads installed version from .claude-plugin/plugin.json; queries GitHub Releases.
 * Respects RUGPROOF_OFFLINE=1.
 */

import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const PLUGIN_JSON = resolve(here, "..", "..", ".claude-plugin", "plugin.json");
const REPO = process.env.RUGPROOF_REPO ?? "iktok90-design/AuditSentry";

function cmpVer(a: string, b: string): number {
  const pa = a.replace(/^v/, "").split(".").map(Number);
  const pb = b.replace(/^v/, "").split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const da = pa[i] ?? 0, db = pb[i] ?? 0;
    if (da !== db) return da - db;
  }
  return 0;
}

async function main() {
  if (process.env.RUGPROOF_OFFLINE === "1") {
    console.log(JSON.stringify({ skipped: "offline" }));
    return;
  }
  const plugin = JSON.parse(await readFile(PLUGIN_JSON, "utf-8"));
  const installed = plugin.version ?? "0.0.0";
  let latest: string | null = null;
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
      headers: { "user-agent": "auditsentry-update-check" },
    });
    const j: any = await res.json();
    latest = j?.tag_name ?? null;
  } catch (e) {
    console.log(JSON.stringify({ error: String(e), installed }));
    return;
  }
  if (!latest) {
    console.log(JSON.stringify({ error: "no release tag", installed }));
    return;
  }
  const update = cmpVer(latest, installed) > 0;
  console.log(JSON.stringify({ installed, latest, update_available: update,
    install: update ? `/plugin update auditsentry` : null }));
}

main().catch((err) => {
  console.error("check-update failed:", err);
  process.exit(1);
});
