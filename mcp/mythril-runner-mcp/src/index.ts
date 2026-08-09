#!/usr/bin/env node
/**
 * AuditSentry mythril-runner MCP server.
 * Runs Mythril (`myth analyze <target> -o json`) when installed; otherwise
 * returns a labeled representative sample with the same shape so the downstream
 * `parse-mythril` step works offline.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { spawn } from "node:child_process";
import { textResult, stub, hasBinary, isOffline, assertSafeArg } from "@auditsentry/mcp-shared";

const MYTH = process.env.MYTHRIL_PATH ?? "myth";

const SAMPLE = {
  error: null,
  issues: [
    {
      "swc-id": "107",
      severity: "High",
      title: "State access after external call",
      description: { head: "Reentrancy", tail: "A reachable state change follows an external call." },
      function: "withdraw",
      filename: "Vault.sol",
      lineno: 42,
    },
    {
      "swc-id": "101",
      severity: "Medium",
      title: "Integer Arithmetic Bugs",
      description: { head: "Possible overflow", tail: "" },
      function: "deposit",
      filename: "Vault.sol",
      lineno: 18,
    },
  ],
};

function runMyth(target: string, extra: string[], cwd?: string, timeoutMs = 300000) {
  return new Promise<{ stdout: string; stderr: string; code: number; timedOut?: boolean }>((resolve) => {
    const child = spawn(MYTH, ["analyze", target, "-o", "json", ...extra], {
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
  { name: "auditsentry-mythril-runner", version: "0.2.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "analyze",
      description:
        "Run Mythril symbolic analysis on a target. Returns raw Mythril JSON under `mythril`; pipe through parse-mythril for AuditSentry findings. Falls back to a labeled sample when Mythril isn't installed.",
      inputSchema: {
        type: "object",
        properties: {
          target: { type: "string", description: "solidity file or address to analyze" },
          cwd: { type: "string" },
          args: { type: "array", items: { type: "string" }, description: "extra myth flags (e.g. --execution-timeout)" },
        },
        required: ["target"],
      },
    },
    {
      name: "is_available",
      description: "Report whether the `myth` binary is installed and reachable.",
      inputSchema: { type: "object", properties: {} },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params;

  if (name === "is_available") {
    const available = !isOffline() && (await hasBinary(MYTH));
    return textResult({ tool: "mythril", available, offline: isOffline() });
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

    if (isOffline() || !(await hasBinary(MYTH))) {
      return stub("mythril not installed or offline; returning representative sample", { mythril: SAMPLE });
    }

    const r = await runMyth(target, extra ?? [], cwd);
    let parsed: any = null;
    try { parsed = JSON.parse(r.stdout); } catch { /* not json */ }
    if (!parsed) {
      return stub(`mythril produced no parseable JSON (code ${r.code}); returning sample`, {
        mythril: SAMPLE,
        stderr: r.stderr.slice(0, 2000),
      });
    }
    return textResult({ stub: false, code: r.code, mythril: parsed });
  }

  throw new Error(`unknown tool: ${name}`);
});

const transport = new StdioServerTransport();
await server.connect(transport);
