#!/usr/bin/env node
/**
 * Compose a tweet from the latest audit findings.
 *
 * Two modes:
 *   - default (no auth): generates a tweet draft + an X intent URL the user can open in a browser
 *   - --auto: posts via the X API v2 (requires TWITTER_BEARER_TOKEN + media upload via v1.1)
 *
 * Usage:
 *   tweet --findings <path> [--card <path/to.png>] [--auto] [--draft-only]
 */

import { readFile } from "node:fs/promises";
import { resolve, basename } from "node:path";
import { spawn } from "node:child_process";

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

function compose(findings: any): string {
  const c = findings.counts || {};
  const lines = [
    `🛡 AuditSentry audit: ${findings.target ?? "—"}`,
    "",
    `Grade: ${findings.grade ?? "?"}   ⛔ ${c.critical ?? 0}  ⚠ ${c.high ?? 0}  ⚡ ${c.medium ?? 0}`,
    "",
    findings.top_finding ? `Top: ${findings.top_finding}` : "",
    "",
    "Audited with @auditsentry_dev",
  ].filter(Boolean);

  let text = lines.join("\n");
  if (text.length > 280) text = text.slice(0, 277) + "…";
  return text;
}

async function postViaApi(text: string, mediaPath?: string) {
  const bearer = process.env.TWITTER_BEARER_TOKEN;
  if (!bearer) throw new Error("TWITTER_BEARER_TOKEN not set");
  const apiKey = process.env.TWITTER_API_KEY ?? "";
  const apiSecret = process.env.TWITTER_API_SECRET ?? "";
  if (mediaPath) {
    if (!apiKey || !apiSecret) {
      throw new Error("Media upload requires TWITTER_API_KEY + TWITTER_API_SECRET (OAuth1 still required for media v1.1).");
    }
    // Real implementation: v1.1 media upload + OAuth1 signing. We avoid pulling in oauth-1.0a to stay light.
    throw new Error("--auto media upload not yet implemented; use manual mode and attach the PNG yourself.");
  }
  const res = await fetch("https://api.x.com/2/tweets", {
    method: "POST",
    headers: { "authorization": `Bearer ${bearer}`, "content-type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`X API ${res.status}: ${body}`);
  }
  return await res.json();
}

function openUrl(url: string) {
  const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
  spawn(cmd, [url], { stdio: "ignore", detached: true }).unref();
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.findings) {
    console.error("usage: tweet --findings <path> [--card path.png] [--auto] [--draft-only]");
    process.exit(1);
  }

  const findings = JSON.parse(await readFile(resolve(args.findings), "utf-8"));
  const text = compose(findings);

  if (args.auto && args.auto !== "false") {
    const result = await postViaApi(text, args.card);
    console.log("✓ posted via X API");
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  // Manual mode — generate intent URL + open browser unless --draft-only
  const url = `https://x.com/intent/tweet?text=${encodeURIComponent(text)}`;
  console.log("Tweet draft:");
  console.log("---");
  console.log(text);
  console.log("---");
  console.log(`Length: ${text.length} / 280`);
  console.log(`\nIntent URL: ${url}`);
  if (args.card) {
    console.log(`Attach manually: ${resolve(args.card)} (${basename(args.card)})`);
  }
  if (!args["draft-only"] || args["draft-only"] === "false") {
    openUrl(url);
    console.log("\n✓ opened in browser. Attach the PNG card manually before sending.");
  }
}

main().catch((err) => { console.error("tweet failed:", err); process.exit(1); });
