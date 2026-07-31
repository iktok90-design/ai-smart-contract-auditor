#!/usr/bin/env node
/**
 * AuditSentry slither-runner MCP server.
 * Runs Slither (`slither <target> --json -`) when it is installed; otherwise
 * returns a labeled representative sample with the same shape so the downstream
 * `parse-slither` step works offline. Pipe the `slither` payload through
 * scripts/dist/parse-slither.js to get normalized AuditSentry findings.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { textResult, stub, hasBinary, isOffline, assertSafeArg, hashKey, readCache, writeCache } from "@auditsentry/mcp-shared";

const CACHE_TTL_MS = 60 * 60 * 1000; // 1h — re-analysis of unchanged source is skipped

const SLITHER = process.env.SLITHER_PATH ?? "slither";

// Representative Slither --json output, used when slither isn't installed so the
// pipeline (and demos/tests) still produce something parse-slither can normalize.
const SAMPLE = {
  success: true,
  error: null,
  results: {
    detectors: [
      {
        check: "reentrancy-eth",
        impact: "High",
        confidence: "Medium",
        description: "Reentrancy in Vault.withdraw(uint256): state written after external call.",
        elements: [
          { type: "function", name: "withdraw", source_mapping: { filename_short: "src/Vault.sol", filename_relative: "src/Vault.sol", lines: [42] } },
        ],
      },
      {
        check: "unchecked-transfer",
        impact: "Medium",
        confidence: "High",
        description: "ERC20 transfer return value ignored in Vault.sweep().",
        elements: [
          { type: "node", name: "sweep", source_mapping: { filename_short: "src/Vault.sol", lines: [70] } },
        ],
      },
    ],
  },
};

function runSlither(target: string, extra: string[], cwd?: string, timeoutMs = 180000) {
  return new Promise<{ stdout: string; stderr: string; code: number; timedOut?: boolean }>((resolve) => {
    const child = spawn(SLITHER, [target, "--json", "-", ...extra], {
      cwd,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "", stderr = "", settled = false;
    const finish = (r: { stdout: string; stderr: string; code: number; timedOut?: boolean }) => {
      if (settled) return;
      settled = true;
      clearTimeout(t);
      resolve(r);
    };
    const t = setTimeout(() => { try { child.kill("SIGKILL"); } catch {} finish({ stdout, stderr, code: -1, timedOut: true }); }, timeoutMs);
    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("close", (code) => finish({ stdout, stderr, code: code ?? -1 }));
    child.on("error", (err) => finish({ stdout: "", stderr: String(err), code: -1 }));
  });
}

const server = new Server(
  { name: "auditsentry-slither-runner", version: "0.2.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "analyze",
      description:
        "Run Slither on a target (file/dir/contract). Returns raw Slither JSON under `slither`; pipe through parse-slither for AuditSentry findings. Falls back to a labeled sample when Slither isn't installed.",
      inputSchema: {
        type: "object",
        properties: {
          target: { type: "string", description: "path or contract to analyze" },
          cwd: { type: "string" },
          args: { type: "array", items: { type: "string" }, description: "extra slither flags" },
        },
        required: ["target"],
      },
    },
    {
      name: "is_available",
      description: "Report whether the `slither` binary is installed and reachable.",
      inputSchema: { type: "object", properties: {} },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params;

  if (name === "is_available") {
    const available = !isOffline() && (await hasBinary(SLITHER));
    return textResult({ tool: "slither", available, offline: isOffline() });
  }

  if (name === "analyze") {
    const { target, cwd, args: extra } = z.object({
      target: z.string(),
      cwd: z.string().optional(),
      args: z.array(z.string()).optional(),
    }).parse(args);
    assertSafeArg(target, "target");
    if (cwd) assertSafeArg(cwd, "cwd");
    (extra ?? []).forEach((a, i) => assertSafeArg(a, `args[${i}]`));

    if (isOffline() || !(await hasBinary(SLITHER))) {
      return stub("slither not installed or offline; returning representative sample", { slither: SAMPLE });
    }

    // Incremental: if the target is a single readable file, key the cache on its
    // contents + flags so re-analyzing unchanged source is instant.
    let cacheKey: string | null = null;
    try {
      const src = await readFile(target, "utf-8");
      cacheKey = hashKey("slither", src, JSON.stringify(extra ?? []));
      const cached = await readCache<any>(cacheKey, CACHE_TTL_MS);
      if (cached) return textResult({ stub: false, cached: true, slither: cached });
    } catch { /* not a single file — skip caching */ }

    const r = await runSlither(target, extra ?? [], cwd);
    // Slither exits non-zero when it finds issues, but still emits JSON on stdout.
    let parsed: any = null;
    try { parsed = JSON.parse(r.stdout); } catch { /* not json */ }
    if (!parsed) {
      return stub(`slither produced no parseable JSON (code ${r.code}); returning sample`, {
        slither: SAMPLE,
        stderr: r.stderr.slice(0, 2000),
      });
    }
    if (cacheKey) await writeCache(cacheKey, parsed);
    return textResult({ stub: false, code: r.code, slither: parsed });
  }

  throw new Error(`unknown tool: ${name}`);
});

const transport = new StdioServerTransport();
await server.connect(transport);
