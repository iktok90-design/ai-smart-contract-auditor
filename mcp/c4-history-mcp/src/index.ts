#!/usr/bin/env node
/**
 * AuditSentry Code4rena history MCP server.
 * Searches Code4rena's public reports archive on GitHub.
 *
 * Strategy:
 *   - Primary: search the code-423n4 GitHub org for issues by query terms
 *   - Cache: ~/.cache/auditsentry/c4-history.json (TTL 24h)
 *   - Fallback: curated stub data when offline / GitHub rate-limited
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
const CACHE_FILE = resolve(CACHE_DIR, "c4-history.json");
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const GH_TOKEN = process.env.GITHUB_TOKEN ?? "";

type Finding = {
  id: string;
  protocol: string;
  severity: string;
  title: string;
  vuln: string;
  date: string;
  url?: string;
  body?: string;
};

const STUB: Finding[] = [
  { id: "C4-2023-07-curve-1", protocol: "Curve Vyper", severity: "Critical", title: "Vyper compiler reentrancy on raw_call", vuln: "reentrancy", date: "2023-07-30" },
  { id: "C4-2022-04-beanstalk-1", protocol: "Beanstalk", severity: "Critical", title: "Flash-loan governance vote bypass", vuln: "flash-loan-attacks", date: "2022-04-17" },
  { id: "C4-2022-08-nomad-1", protocol: "Nomad", severity: "Critical", title: "Replay attack via zero merkle root", vuln: "cross-chain-messaging", date: "2022-08-01" },
  { id: "C4-2024-03-munchables", protocol: "Munchables", severity: "Critical", title: "Blacklisted EOA single-key admin compromise", vuln: "centralization-risk", date: "2024-03-13" },
  { id: "C4-2023-11-kyber", protocol: "KyberSwap", severity: "Critical", title: "Concentrated-liquidity precision exploit", vuln: "amm-specialist", date: "2023-11-22" },
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
    "user-agent": "auditsentry-c4-history",
    "accept": "application/vnd.github+json",
  };
  if (GH_TOKEN) headers["authorization"] = `Bearer ${GH_TOKEN}`;
  try {
    const url = `https://api.github.com/search/issues?q=${encodeURIComponent(query + " org:code-423n4 is:issue")}&per_page=20`;
    const res = await fetch(url, { headers });
    if (!res.ok) return [];
    const j: any = await res.json();
    return (j.items || []).slice(0, 20).map((it: any): Finding => ({
      id: `C4-${(it.repository_url || "").split("/").pop()}-${it.number}`,
      protocol: repoToProtocol(it.repository_url),
      severity: severityFromLabels(it.labels),
      title: it.title,
      vuln: vulnFromLabels(it.labels),
      date: (it.created_at || "").slice(0, 10),
      url: it.html_url,
      body: typeof it.body === "string" ? it.body.slice(0, 1500) : undefined,
    }));
  } catch {
    return [];
  }
}

/**
 * Derive a human protocol name from a Code4rena repo URL. C4 repos are named
 * like `2023-07-curve-findings` or `2024-03-munchables`. Strip the leading
 * `YYYY-MM-` (or `YYYY-`) date prefix and common trailing suffixes, robustly —
 * the old code assumed every repo had a `YYYY-MM-` prefix and otherwise kept
 * the raw slug.
 */
function repoToProtocol(repoUrl: string | undefined): string {
  const slug = (repoUrl || "").split("/").pop() ?? "";
  if (!slug) return "?";
  return slug
    .replace(/^\d{4}-\d{2}-/, "")
    .replace(/^\d{4}-/, "")
    .replace(/-(findings|mitigation-review|judging)$/i, "")
    || slug;
}

function severityFromLabels(labels: any[]): string {
  const names = (labels || []).map((l: any) => (l.name || "").toLowerCase());
  if (names.some((n: string) => n.includes("high") || n.includes("h-"))) return "High";
  if (names.some((n: string) => n.includes("med") || n.includes("m-"))) return "Medium";
  if (names.some((n: string) => n.includes("low") || n.includes("l-"))) return "Low";
  return "Info";
}

function vulnFromLabels(labels: any[]): string {
  const names = (labels || []).map((l: any) => (l.name || "").toLowerCase());
  for (const k of ["reentrancy","oracle","flash-loan","governance","access","signature","upgrade","amm"]) {
    if (names.some((n: string) => n.includes(k))) return k;
  }
  return "general";
}

const server = new Server(
  { name: "auditsentry-c4-history", version: "0.1.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "search",
      description:
        "Search the Code4rena historical findings DB. Real GitHub fetch with 24h cache; falls back to curated stub when offline.",
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
      description: "Get full details for one finding by id.",
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
  const queries = ["reentrancy", "oracle", "flash loan", "governance", "signature replay"];
  const all = (await Promise.all(queries.map(fetchFromGitHub))).flat();
  const dedup = Array.from(new Map(all.map((f) => [f.id, f])).values());
  const merged = [...STUB, ...dedup];
  if (merged.length > 0) await saveCache(merged);
  return {
    findings: merged.length > STUB.length ? merged : STUB,
    source: merged.length > STUB.length ? "github+stub" : "stub-only",
  };
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
      url: f.url ?? `https://code4rena.com/reports/${f.id}`,
      body: f.body ?? `Stub-narrative for ${f.title}.`,
    });
  }

  if (name === "refresh_cache") {
    const queries = ["reentrancy", "oracle", "flash loan", "governance", "signature replay", "upgrade"];
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
