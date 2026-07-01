#!/usr/bin/env node
/**
 * AuditSentry forge-runner MCP server.
 * Wraps Foundry: build, test, exec against fork, gas report, coverage, storage inspect.
 *
 * STATUS: scaffold — calls real `forge` if available, otherwise returns mock data.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { spawn } from "node:child_process";

const FORGE = process.env.FORGE_PATH ?? "forge";

async function runForge(args: string[], cwd?: string): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    const child = spawn(FORGE, args, { cwd, env: process.env });
    let stdout = "", stderr = "";
    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("close", (code) => resolve({ stdout, stderr, code: code ?? -1 }));
    child.on("error", (err) => resolve({ stdout: "", stderr: String(err), code: -1 }));
  });
}

const server = new Server(
  { name: "auditsentry-forge-runner", version: "0.1.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "build",
      description: "Run `forge build` in the given directory.",
      inputSchema: {
        type: "object",
        properties: { cwd: { type: "string" }, flags: { type: "array", items: { type: "string" } } },
      },
    },
    {
      name: "test",
      description: "Run `forge test`. Optionally filter by --match-test.",
      inputSchema: {
        type: "object",
        properties: {
          cwd: { type: "string" },
          test: { type: "string", description: "match test name" },
          forkUrl: { type: "string" },
          flags: { type: "array", items: { type: "string" } },
        },
      },
    },
    {
      name: "gas_report",
      description: "Run `forge test --gas-report` and return parsed gas usage.",
      inputSchema: { type: "object", properties: { cwd: { type: "string" } } },
    },
    {
      name: "coverage",
      description: "Run `forge coverage` and return per-file/branch coverage.",
      inputSchema: {
        type: "object",
        properties: { cwd: { type: "string" }, format: { type: "string", enum: ["summary", "json"] } },
      },
    },
    {
      name: "inspect_storage",
      description: "Run `forge inspect <Contract> storageLayout`.",
      inputSchema: {
        type: "object",
        properties: { cwd: { type: "string" }, path: { type: "string" }, contract: { type: "string" } },
        required: ["path"],
      },
    },
    {
      name: "exec",
      description: "Run a single named forge test against a fork URL (e.g. anvil).",
      inputSchema: {
        type: "object",
        properties: { cwd: { type: "string" }, forkUrl: { type: "string" }, test: { type: "string" } },
        required: ["forkUrl", "test"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params;

  if (name === "build") {
    const { cwd, flags } = z.object({
      cwd: z.string().optional(), flags: z.array(z.string()).optional(),
    }).parse(args ?? {});
    const r = await runForge(["build", ...(flags ?? [])], cwd);
    return textResult({ ok: r.code === 0, ...r });
  }

  if (name === "test") {
    const { cwd, test, forkUrl, flags } = z.object({
      cwd: z.string().optional(),
      test: z.string().optional(),
      forkUrl: z.string().optional(),
      flags: z.array(z.string()).optional(),
    }).parse(args ?? {});
    const fa: string[] = ["test"];
    if (test) fa.push("--match-test", test);
    if (forkUrl) fa.push("--fork-url", forkUrl);
    if (flags) fa.push(...flags);
    const r = await runForge(fa, cwd);
    return textResult({ ok: r.code === 0, ...r });
  }

  if (name === "gas_report") {
    const { cwd } = z.object({ cwd: z.string().optional() }).parse(args ?? {});
    const r = await runForge(["test", "--gas-report"], cwd);
    if (r.code !== 0) {
      return textResult({
        __stub: true,
        __reason: "forge unavailable or `forge test --gas-report` failed; returning representative mock gas figures",
        report: {
          deposit: { avg: 147000, min: 142000, max: 158000, median: 144000 },
          withdraw: { avg: 203000, min: 189000, max: 225000, median: 198000 },
        },
      });
    }
    return textResult({ ok: true, raw: r.stdout });
  }

  if (name === "coverage") {
    const { cwd, format } = z.object({
      cwd: z.string().optional(),
      format: z.enum(["summary", "json"]).optional(),
    }).parse(args ?? {});
    const fa = ["coverage"];
    if (format === "json") fa.push("--report", "lcov");
    const r = await runForge(fa, cwd);
    if (r.code !== 0) {
      return textResult({
        __stub: true,
        __reason: "forge unavailable or `forge coverage` failed; returning representative mock coverage",
        files: [
          { path: "src/Vault.sol", lines: 78, branches: 71 },
          { path: "src/Oracle.sol", lines: 92, branches: 84 },
        ],
      });
    }
    return textResult({ ok: true, raw: r.stdout });
  }

  if (name === "inspect_storage") {
    const { cwd, path, contract } = z.object({
      cwd: z.string().optional(),
      path: z.string(),
      contract: z.string().optional(),
    }).parse(args);
    const target = contract ? `${path}:${contract}` : path;
    const r = await runForge(["inspect", target, "storageLayout"], cwd);
    if (r.code !== 0) {
      return textResult({
        __stub: true,
        __reason: "forge unavailable or `forge inspect` failed; returning representative mock storage layout",
        storage: [
          { label: "owner", offset: 0, slot: "0", type: "t_address" },
          { label: "balance", offset: 0, slot: "1", type: "t_mapping(t_address,t_uint256)" },
        ],
      });
    }
    return textResult({ ok: true, raw: r.stdout });
  }

  if (name === "exec") {
    const { cwd, forkUrl, test } = z.object({
      cwd: z.string().optional(),
      forkUrl: z.string(),
      test: z.string(),
    }).parse(args);
    const r = await runForge(["test", "--match-test", test, "--fork-url", forkUrl, "-vvv"], cwd);
    return textResult({ ok: r.code === 0, ...r });
  }

  throw new Error(`unknown tool: ${name}`);
});

function textResult(obj: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(obj, null, 2) }] };
}

const transport = new StdioServerTransport();
await server.connect(transport);
