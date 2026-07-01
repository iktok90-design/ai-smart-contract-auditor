#!/usr/bin/env node
/**
 * AuditSentry Sherlock history MCP server.
 * Searches Sherlock's audit findings via GitHub (sherlock-audit org).
 *
 * Strategy:
 *   - Primary: GitHub issues across sherlock-audit org repos
 *   - Cache: ~/.cache/auditsentry/sherlock-history.json (TTL 24h)
 *   - Fallback: curated stub data
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { resolve } from "node:path";

const CACHE_DIR = resolve(homedir(), ".cache", "auditsentry");
const CACHE_FILE = resolve(CACHE_DIR, "sherlock-history.json");
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const GH_TOKEN = process.env.GITHUB_TOKEN ?? "";

type Finding = {
  id: string;
  protocol: string;
  severity: string;
  title: string;
  vuln: string;
  contest: string;
  url?: string;
  body?: string;
};

const STUB: Finding[] = [
  { id: "SHRLK-001", protocol: "Asymmetry afETH", severity: "High", title: "Slippage absent in vault rebalance", vuln: "mev-frontrunning", contest: "afeth-rebalance-2024" },
  { id: "SHRLK-002", protocol: "Eigenpie", severity: "High", title: "Restaking deposit ignores LST depeg", vuln: "restaking-eigenlayer", contest: "eigenpie-2024" },
  { id: "SHRLK-003", protocol: "GMX V2", severity: "Medium", title: "Order keeper can drop user-favorable orders", vuln: "centralization-risk", contest: "gmx-v2-2023" },
  { id: "SHRLK-004", protocol: "Velodrome V2", severity: "High", title: "veNFT vote-weight not snapshotted at proposal", vuln: "flash-loan-attacks", contest: "velo-v2-2023" },
];

async function loadCache(): Promise<Finding[] | null> {
  try {
    const data = JSON.parse(await readFile(CACHE_FILE, "utf-8"));
    if (Date.now() - data.ts < CACHE_TTL_MS) return data.findings;
  } catch {}
  return null;
}

async function saveCache(findings: Finding[]) {
  try {
    await mkdir(CACHE_DIR, { recursive: true });
    await writeFile(CACHE_FILE, JSON.stringify({ ts: Date.now(), findings }, null, 2), "utf-8");
  } catch {}
}

async function fetchFromGitHub(query: string): Promise<Finding[]> {
  if (process.env.RUGPROOF_OFFLINE === "1") return [];
  const headers: Record<string, string> = {
    "user-agent": "auditsentry-sherlock-history",
    "accept": "application/vnd.github+json",
  };
  if (GH_TOKEN) headers["authorization"] = `Bearer ${GH_TOKEN}`;
  try {
    const url = `https://api.github.com/search/issues?q=${encodeURIComponent(query + " org:sherlock-audit is:issue")}&per_page=20`;
    const res = await fetch(url, { headers });
    if (!res.ok) return [];
    const j: any = await res.json();
    return (j.items || []).slice(0, 20).map((it: any): Finding => ({
      id: `SHRLK-${(it.repository_url || "").split("/").pop()}-${it.number}`,
      protocol: repoToProtocol(it.repository_url),
      severity: severityFromLabels(it.labels),
      title: it.title,
      vuln: vulnFromTitle(it.title),
      contest: (it.repository_url || "").split("/").pop() ?? "?",
      url: it.html_url,
      body: typeof it.body === "string" ? it.body.slice(0, 1500) : undefined,
    }));
  } catch {
    return [];
  }
}

/**
 * Derive a protocol name from a Sherlock contest repo URL. Sherlock repos look
 * like `2024-01-foo-protocol-judging`; strip the `-judging` suffix and any
 * leading date prefix robustly.
 */
function repoToProtocol(repoUrl: string | undefined): string {
  const slug = (repoUrl || "").split("/").pop() ?? "";
  if (!slug) return "?";
  return slug
    .replace(/-judging$/i, "")
    .replace(/^\d{4}-\d{2}-/, "")
    .replace(/^\d{4}-/, "")
    || slug;
}

function severityFromLabels(labels: any[]): string {
  const names = (labels || []).map((l: any) => (l.name || "").toLowerCase());
  if (names.some((n: string) => n.includes("high"))) return "High";
  if (names.some((n: string) => n.includes("medium") || n.includes("med"))) return "Medium";
  if (names.some((n: string) => n.includes("low"))) return "Low";
  return "Info";
}

function vulnFromTitle(title: string): string {
  const t = title.toLowerCase();
  for (const k of ["reentrancy","oracle","flash","governance","access","signature","upgrade","slippage","rounding","permit"]) {
    if (t.includes(k)) return k;
  }
  return "general";
}

const server = new Server(
  { name: "auditsentry-sherlock-history", version: "0.1.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "search",
      description:
        "Search Sherlock historical findings via the sherlock-audit GitHub org. 24h cache; offline fallback to curated stub.",
      inputSchema: {
        type: "object",
        properties: {
          protocol: { type: "string" }, vuln: { type: "string" },
          severity: { type: "string" }, keyword: { type: "string" },
          limit: { type: "number" },
        },
      },
    },
    {
      name: "get_finding",
      description: "Get full details for one Sherlock finding by id.",
      inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
    },
    {
      name: "refresh_cache",
      description: "Force-refresh the GitHub cache.",
      inputSchema: { type: "object", properties: {} },
    },
  ],
}));

async function unionPool(): Promise<{ findings: Finding[]; source: string }> {
  const cached = await loadCache();
  if (cached && cached.length > 0) return { findings: cached, source: "cache" };
  const queries = ["reentrancy", "oracle", "flash loan", "governance", "slippage", "signature"];
  const all = (await Promise.all(queries.map(fetchFromGitHub))).flat();
  const dedup = Array.from(new Map(all.map((f) => [f.id, f])).values());
  const merged = [...STUB, ...dedup];
  if (merged.length > 0) await saveCache(merged);
  return { findings: merged.length > STUB.length ? merged : STUB, source: merged.length > STUB.length ? "github+stub" : "stub-only" };
}

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params;

  if (name === "search") {
    const p = z.object({
      protocol: z.string().optional(), vuln: z.string().optional(),
      severity: z.string().optional(), keyword: z.string().optional(),
      limit: z.number().optional(),
    }).parse(args ?? {});
    const { findings, source } = await unionPool();
    let results = findings.slice();
    if (p.protocol) results = results.filter((x) => x.protocol.toLowerCase().includes(p.protocol!.toLowerCase()));
    if (p.vuln) results = results.filter((x) => x.vuln.toLowerCase().includes(p.vuln!.toLowerCase()));
    if (p.severity) results = results.filter((x) => x.severity.toLowerCase() === p.severity!.toLowerCase());
    if (p.keyword) {
      const kw = p.keyword.toLowerCase();
      results = results.filter((x) =>
        x.title.toLowerCase().includes(kw) ||
        x.protocol.toLowerCase().includes(kw) ||
        (x.body || "").toLowerCase().includes(kw)
      );
    }
    if (p.limit) results = results.slice(0, p.limit);
    return textResult({ source, count: results.length, results });
  }

  if (name === "get_finding") {
    const { id } = z.object({ id: z.string() }).parse(args);
    const { findings } = await unionPool();
    const f = findings.find((x) => x.id === id);
    if (!f) return textResult({ __error: "not found" });
    return textResult({
      ...f,
      url: f.url ?? `https://audits.sherlock.xyz/contests/${f.contest}/${f.id}`,
      body: f.body ?? `Stub-narrative for ${f.title}.`,
    });
  }

  if (name === "refresh_cache") {
    const queries = ["reentrancy", "oracle", "flash loan", "governance", "slippage", "signature", "upgrade"];
    const all = (await Promise.all(queries.map(fetchFromGitHub))).flat();
    const dedup = Array.from(new Map(all.map((f) => [f.id, f])).values());
    await saveCache([...STUB, ...dedup]);
    return textResult({ refreshed: true, count: dedup.length, cached_at: new Date().toISOString() });
  }

  throw new Error(`unknown tool: ${name}`);
});

function textResult(obj: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(obj, null, 2) }] };
}

const transport = new StdioServerTransport();
await server.connect(transport);
