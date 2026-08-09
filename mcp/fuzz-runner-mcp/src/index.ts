#!/usr/bin/env node
/**
 * AuditSentry fuzz-runner MCP server.
 * Wraps the property-fuzzing / symbolic toolchain — Echidna, Medusa, Halmos.
 * Each tool runs the real binary when installed; otherwise it returns a labeled
 * representative sample so /fuzz, /invariant, and /prover work offline.
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

const BIN = {
  echidna: process.env.ECHIDNA_PATH ?? "echidna",
  medusa: process.env.MEDUSA_PATH ?? "medusa",
  halmos: process.env.HALMOS_PATH ?? "halmos",
};

function run(bin: string, args: string[], cwd?: string, timeoutMs = 600000) {
  return new Promise<{ stdout: string; stderr: string; code: number; timedOut?: boolean }>((resolve) => {
    const child = spawn(bin, args, { cwd, env: process.env, stdio: ["ignore", "pipe", "pipe"] });
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

const SAMPLE = {
  echidna: {
    tool: "echidna",
    passed: false,
    failed_properties: [
      { property: "echidna_balance_under_cap", call_sequence: ["mint(1000000)", "withdraw(1000000)"], note: "invariant violated: balance exceeded cap" },
    ],
    tests_passed: 7,
  },
  medusa: {
    tool: "medusa",
    passed: false,
    failed_properties: [
      { property: "property_total_supply_constant", shrunk_sequence: ["deposit(1)", "exploit()"], note: "totalSupply changed unexpectedly" },
    ],
  },
  halmos: {
    tool: "halmos",
    results: [
      { test: "check_transfer_preserves_total", outcome: "pass", note: "proven for all inputs (no counterexample)" },
      { test: "check_withdraw_solvency", outcome: "fail", counterexample: { amount: "0x...", caller: "0x...attacker" } },
    ],
  },
};

const server = new Server(
  { name: "auditsentry-fuzz-runner", version: "0.5.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "echidna",
      description: "Property fuzz a contract with Echidna. Returns failing properties + shrunk call sequences. Labeled sample when Echidna isn't installed.",
      inputSchema: {
        type: "object",
        properties: {
          target: { type: "string", description: "solidity file" },
          contract: { type: "string" },
          cwd: { type: "string" },
          args: { type: "array", items: { type: "string" } },
        },
        required: ["target"],
      },
    },
    {
      name: "medusa",
      description: "Property fuzz with Medusa (Go, parallel). Labeled sample when Medusa isn't installed.",
      inputSchema: {
        type: "object",
        properties: { cwd: { type: "string" }, args: { type: "array", items: { type: "string" } } },
      },
    },
    {
      name: "halmos",
      description: "Symbolically check `check_`-prefixed Foundry tests with Halmos — proof or counterexample. Labeled sample when Halmos isn't installed.",
      inputSchema: {
        type: "object",
        properties: {
          cwd: { type: "string" },
          function: { type: "string", description: "match a specific check_ function" },
          args: { type: "array", items: { type: "string" } },
        },
      },
    },
    {
      name: "is_available",
      description: "Report which of echidna / medusa / halmos are installed.",
      inputSchema: { type: "object", properties: {} },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params;

  if (name === "is_available") {
    if (isOffline()) return textResult({ offline: true, echidna: false, medusa: false, halmos: false });
    const [echidna, medusa, halmos] = await Promise.all([
      hasBinary(BIN.echidna), hasBinary(BIN.medusa), hasBinary(BIN.halmos),
    ]);
    return textResult({ offline: false, echidna, medusa, halmos });
  }

  if (name === "echidna") {
    const { target, contract, cwd, args: extra } = z.object({
      target: z.string(), contract: z.string().optional(),
      cwd: z.string().optional(), args: z.array(z.string()).optional(),
    }).parse(args);
    assertSafeArg(target, "target");
    if (cwd) assertSafeArg(cwd, "cwd");
    (extra ?? []).forEach((a, i) => assertSafeArg(a, `args[${i}]`));
    if (isOffline() || !(await hasBinary(BIN.echidna))) {
      return stub("echidna not installed or offline; representative sample", { result: SAMPLE.echidna });
    }
    const fa = [target, "--format", "json", ...(contract ? ["--contract", contract] : []), ...(extra ?? [])];
    const r = await run(BIN.echidna, fa, cwd);
    let parsed: any = null;
    try { parsed = JSON.parse(r.stdout); } catch { /* echidna json is line-based; pass raw */ }
    return textResult({ stub: false, code: r.code, result: parsed ?? { raw: r.stdout.slice(0, 4000) } });
  }

  if (name === "medusa") {
    const { cwd, args: extra } = z.object({
      cwd: z.string().optional(), args: z.array(z.string()).optional(),
    }).parse(args ?? {});
    if (isOffline() || !(await hasBinary(BIN.medusa))) {
      return stub("medusa not installed or offline; representative sample", { result: SAMPLE.medusa });
    }
    const r = await run(BIN.medusa, ["fuzz", ...(extra ?? [])], cwd);
    return textResult({ stub: false, code: r.code, raw: r.stdout.slice(0, 4000), stderr: r.stderr.slice(0, 1000) });
  }

  if (name === "halmos") {
    const { cwd, function: fn, args: extra } = z.object({
      cwd: z.string().optional(), function: z.string().optional(), args: z.array(z.string()).optional(),
    }).parse(args ?? {});
    if (isOffline() || !(await hasBinary(BIN.halmos))) {
      return stub("halmos not installed or offline; representative sample", { result: SAMPLE.halmos });
    }
    const fa = [...(fn ? ["--function", fn] : []), ...(extra ?? [])];
    const r = await run(BIN.halmos, fa, cwd);
    return textResult({ stub: false, code: r.code, raw: r.stdout.slice(0, 4000) });
  }

  throw new Error(`unknown tool: ${name}`);
});

const transport = new StdioServerTransport();
await server.connect(transport);
