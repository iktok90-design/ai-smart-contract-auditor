#!/usr/bin/env node
/**
 * Post the latest audit findings to a Discord channel via webhook.
 *
 * Usage:
 *   notify-discord --findings <path> [--webhook-url <url>] [--severity-filter LEVEL] [--mention-role <id>]
 */

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const SEV_LEVEL: Record<string, number> = { info: 0, low: 1, medium: 2, high: 3, critical: 4 };
const SEV_COLOR: Record<string, number> = {
  critical: 0xff4747, high: 0xff8c42, medium: 0xffc94a, low: 0x4ac3ff, info: 0x8b949e,
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

async function readWebhook(args: Record<string, string>): Promise<string> {
  if (args["webhook-url"]) return args["webhook-url"];
  if (process.env.DISCORD_WEBHOOK_URL) return process.env.DISCORD_WEBHOOK_URL;
  try {
    const cfg = await readFile(".auditsentry.yml", "utf-8");
    const m = cfg.match(/discord:[\s\S]*?webhook_url:\s*["']?([^\s"']+)/);
    if (m) return m[1];
  } catch {}
  return "";
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.findings) {
    console.error("usage: notify-discord --findings <path> [--webhook-url URL] [--severity-filter LEVEL] [--mention-role ID]");
    process.exit(1);
  }

  const webhook = await readWebhook(args);
  if (!webhook) {
    console.error("error: no webhook URL. Set DISCORD_WEBHOOK_URL, pass --webhook-url, or add to .auditsentry.yml.");
    process.exit(1);
  }

  const findings = JSON.parse(await readFile(resolve(args.findings), "utf-8"));
  const minLevel = SEV_LEVEL[(args["severity-filter"] || "high").toLowerCase()] ?? 3;
  const filtered = (findings.findings || []).filter((f: any) => (SEV_LEVEL[(f.severity || "info").toLowerCase()] ?? 0) >= minLevel);

  const c = findings.counts || {};
  const worstSev = (c.critical > 0 ? "critical" : c.high > 0 ? "high" : c.medium > 0 ? "medium" : "low");
  const top = filtered.slice(0, 5);

  const mention = args["mention-role"] && (worstSev === "critical" || worstSev === "high")
    ? `<@&${args["mention-role"]}> `
    : "";

  const payload = {
    username: "AuditSentry",
    content: `${mention}🛡 New audit: **${findings.target ?? "—"}** · grade **${findings.grade ?? "?"}**`,
    embeds: [
      {
        title: `Audit: ${findings.target ?? "—"}`,
        url: `https://github.com/iktok90-design/AuditSentry`,
        color: SEV_COLOR[worstSev] ?? SEV_COLOR.info,
        fields: [
          { name: "Critical", value: String(c.critical ?? 0), inline: true },
          { name: "High",     value: String(c.high ?? 0),     inline: true },
          { name: "Medium",   value: String(c.medium ?? 0),   inline: true },
          { name: "Low",      value: String(c.low ?? 0),      inline: true },
          { name: "Info",     value: String(c.info ?? 0),     inline: true },
          { name: "Grade",    value: findings.grade ?? "?",   inline: true },
          ...top.map((f: any) => ({
            name: `[${f.severity}] ${f.id} — ${f.title}`,
            value: `\`${f.path}:${f.line}\``,
            inline: false,
          })),
        ],
        timestamp: new Date().toISOString(),
        footer: { text: "auditsentry — github.com/iktok90-design/AuditSentry" },
      },
    ],
  };

  const res = await fetch(webhook, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error(`✗ Discord webhook returned ${res.status}: ${body}`);
    process.exit(1);
  }

  console.log(`✓ posted to Discord (${filtered.length} filtered finding(s); embed includes top ${top.length})`);
}

main().catch((err) => { console.error("notify-discord failed:", err); process.exit(1); });
