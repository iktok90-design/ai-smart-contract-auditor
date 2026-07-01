#!/usr/bin/env node
/**
 * AuditSentry hardhat-runner MCP server.
 * Wraps Hardhat: compile, test, run scripts. Mirror of forge-runner for HH projects.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { spawn } from "node:child_process";

const DEFAULT_TIMEOUT_MS = Number(process.env.RUGPROOF_HH_TIMEOUT_MS ?? 120_000);

async function runNpx(args: string[], cwd?: string, timeoutMs = DEFAULT_TIMEOUT_MS) {
  return new Promise<{ stdout: string; stderr: string; code: number; timedOut?: boolean }>((resolve) => {
    // No shell: args are passed to execve directly, so paths can't be
    // interpreted by a shell (no injection via cwd/script). A timeout guards
    // against `npx hardhat` hanging when Hardhat isn't installed in `cwd`.
    // `--no-install` keeps npx from interactively downloading Hardhat when the
    // cwd isn't a Hardhat project (which would hang on a stdin prompt); stdin is
    // closed so any residual prompt gets EOF and the process exits fast.
    const child = spawn("npx", ["--no-install", ...args], {
      cwd,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "", stderr = "", settled = false;
    const finish = (r: { stdout: string; stderr: string; code: number; timedOut?: boolean }) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(r);
    };
    const timer = setTimeout(() => {
      try { child.kill("SIGKILL"); } catch {}
      finish({ stdout, stderr: stderr + `\n[auditsentry] timed out after ${timeoutMs}ms`, code: -1, timedOut: true });
    }, timeoutMs);
    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("close", (code) => finish({ stdout, stderr, code: code ?? -1 }));
    child.on("error", (err) => finish({ stdout: "", stderr: String(err), code: -1 }));
  });
}

const server = new Server(
  { name: "auditsentry-hardhat-runner", version: "0.1.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "compile",
      description: "Run `npx hardhat compile`.",
      inputSchema: { type: "object", properties: { cwd: { type: "string" } } },
    },
    {
      name: "test",
      description: "Run `npx hardhat test` with optional grep.",
      inputSchema: {
        type: "object",
        properties: { cwd: { type: "string" }, grep: { type: "string" } },
      },
    },
    {
      name: "run",
      description: "Run `npx hardhat run <script>`.",
      inputSchema: {
        type: "object",
        properties: { cwd: { type: "string" }, script: { type: "string" }, network: { type: "string" } },
        required: ["script"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params;

  if (name === "compile") {
    const { cwd } = z.object({ cwd: z.string().optional() }).parse(args ?? {});
    const r = await runNpx(["hardhat", "compile"], cwd);
    return textResult({ ok: r.code === 0, ...r });
  }

  if (name === "test") {
    const { cwd, grep } = z.object({
      cwd: z.string().optional(), grep: z.string().optional(),
    }).parse(args ?? {});
    const fa = ["hardhat", "test"];
    if (grep) fa.push("--grep", grep);
    const r = await runNpx(fa, cwd);
    return textResult({ ok: r.code === 0, ...r });
  }

  if (name === "run") {
    const { cwd, script, network } = z.object({
      cwd: z.string().optional(),
      script: z.string(),
      network: z.string().optional(),
    }).parse(args);
    const fa = ["hardhat", "run", script];
    if (network) fa.push("--network", network);
    const r = await runNpx(fa, cwd);
    return textResult({ ok: r.code === 0, ...r });
  }

  throw new Error(`unknown tool: ${name}`);
});

function textResult(obj: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(obj, null, 2) }] };
}

const transport = new StdioServerTransport();
await server.connect(transport);
