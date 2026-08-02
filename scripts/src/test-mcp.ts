#!/usr/bin/env node
/**
 * MCP smoke + invocation test. For each AuditSentry MCP server, completes
 * the JSON-RPC handshake, lists tools, then invokes one representative
 * tool with realistic args and asserts the response shape.
 *
 * Usage:
 *   node scripts/dist/test-mcp.js                 # test all
 *   node scripts/dist/test-mcp.js gas-tracker     # test one
 */

import { spawn } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, "..", "..");
const MCP_DIR = resolve(ROOT, "mcp");

interface InvokeSpec {
  tool: string;
  args: Record<string, unknown>;
  // Validator: returns null if ok, or error message
  validate: (text: string) => string | null;
}

const SERVERS: Record<string, InvokeSpec> = {
  "block-explorer": {
    tool: "get_constructor_args",
    args: { chain: "ethereum", address: "0x0000000000000000000000000000000000000001" },
    validate: (t) => (t.includes("__stub") || t.includes("data")) ? null : "expected stub data shape",
  },
  "forge-runner": {
    tool: "gas_report",
    args: {},
    validate: (t) => (t.includes("report") || t.includes("__stub") || t.includes("ok")) ? null : "expected report or stub",
  },
  "hardhat-runner": {
    tool: "compile",
    args: {},
    validate: (t) => (t.includes("ok") || t.includes("stderr")) ? null : "expected ok or stderr",
  },
  "anvil": {
    tool: "list_forks",
    args: {},
    validate: (t) => t.includes("forks") ? null : 'expected "forks" key',
  },
  "tenderly": {
    tool: "create_fork",
    args: { chainId: 1 },
    validate: (t) => (t.includes("__stub") || t.includes("fork")) ? null : "expected fork or stub",
  },
  "c4-history": {
    tool: "search",
    args: { vuln: "reentrancy", limit: 3 },
    validate: (t) => t.includes("results") ? null : 'expected "results"',
  },
  "sherlock-history": {
    tool: "search",
    args: { keyword: "oracle", limit: 3 },
    validate: (t) => t.includes("results") ? null : 'expected "results"',
  },
  "gas-tracker": {
    tool: "get_gas_price",
    args: { chain: "ethereum" },
    validate: (t) => (t.includes("gwei") || t.includes("chain")) ? null : "expected gwei or chain",
  },
  "token-metadata": {
    tool: "detect_quirks",
    args: { chain: "ethereum", address: "0xdAC17F958D2ee523a2206206994597C13D831ec7" },
    validate: (t) => t.includes("quirks") ? null : 'expected "quirks"',
  },
  "slither-runner": {
    tool: "analyze",
    args: { target: "examples/VulnerableVault.sol" },
    validate: (t) => t.includes("slither") ? null : 'expected "slither" payload',
  },
  "mythril-runner": {
    tool: "analyze",
    args: { target: "examples/VulnerableVault.sol" },
    validate: (t) => t.includes("mythril") ? null : 'expected "mythril" payload',
  },
  "fuzz-runner": {
    tool: "halmos",
    args: {},
    validate: (t) => (t.includes("result") || t.includes("stub")) ? null : 'expected halmos result/stub',
  },
  "monitoring": {
    tool: "suggest_monitors",
    args: { hasOwner: true, hasProxy: true },
    validate: (t) => t.includes("monitors") ? null : 'expected "monitors"',
  },
};

interface JsonRpc {
  jsonrpc: "2.0";
  id?: number | string;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { code: number; message: string };
}

interface TestResult {
  name: string;
  listOk: boolean;
  tools: number;
  invokeOk: boolean;
  invokeError?: string;
  invokeTool?: string;
  totalError?: string;
}

async function testServer(name: string, spec: InvokeSpec, timeoutMs = 8000): Promise<TestResult> {
  const dist = resolve(MCP_DIR, `${name}-mcp`, "dist", "index.js");
  if (!existsSync(dist)) {
    return { name, listOk: false, tools: 0, invokeOk: false, totalError: `dist missing: ${dist}` };
  }

  return new Promise((resolveResult) => {
    const proc = spawn("node", [dist], { env: process.env });
    let buf = "";
    let toolCount = -1;
    let invokeOk = false;
    let invokeError: string | undefined;
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      try { proc.kill("SIGKILL"); } catch {}
      resolveResult({
        name, listOk: toolCount > 0, tools: Math.max(toolCount, 0),
        invokeOk, invokeError, invokeTool: spec.tool,
        totalError: `timeout after ${timeoutMs}ms`,
      });
    }, timeoutMs);

    proc.on("error", (err) => {
      clearTimeout(timer);
      resolveResult({ name, listOk: false, tools: 0, invokeOk: false, totalError: String(err) });
    });

    proc.stderr.on("data", () => {/* swallow */});

    proc.stdout.on("data", (chunk: Buffer) => {
      buf += chunk.toString();
      while (buf.includes("\n")) {
        const idx = buf.indexOf("\n");
        const line = buf.slice(0, idx).trim();
        buf = buf.slice(idx + 1);
        if (!line) continue;
        let msg: JsonRpc;
        try { msg = JSON.parse(line); } catch { continue; }

        if (msg.id === 1 && msg.result) {
          send(proc, { jsonrpc: "2.0", method: "notifications/initialized" });
          send(proc, { jsonrpc: "2.0", id: 2, method: "tools/list" });
        }

        if (msg.id === 2 && msg.result) {
          const tools = (msg.result as { tools?: unknown[] }).tools ?? [];
          toolCount = tools.length;
          send(proc, {
            jsonrpc: "2.0", id: 3, method: "tools/call",
            params: { name: spec.tool, arguments: spec.args },
          });
        }

        if (msg.id === 3) {
          if (msg.error) {
            invokeOk = false;
            invokeError = `${msg.error.code}: ${msg.error.message}`;
          } else {
            const content = ((msg.result as any)?.content?.[0]?.text ?? "") as string;
            const v = spec.validate(content);
            invokeOk = v === null;
            invokeError = v ?? undefined;
          }
          clearTimeout(timer);
          try { proc.kill("SIGTERM"); } catch {}
          if (!timedOut) {
            resolveResult({
              name, listOk: toolCount > 0, tools: toolCount,
              invokeOk, invokeError, invokeTool: spec.tool,
            });
          }
        }

        if (msg.id !== 3 && msg.error) {
          clearTimeout(timer);
          try { proc.kill("SIGTERM"); } catch {}
          resolveResult({
            name, listOk: false, tools: 0, invokeOk: false,
            totalError: `${msg.error.code}: ${msg.error.message}`,
          });
        }
      }
    });

    send(proc, {
      jsonrpc: "2.0", id: 1, method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "auditsentry-smoke-test", version: "0.1.0" },
      },
    });
  });
}

function send(proc: ReturnType<typeof spawn>, msg: JsonRpc) {
  proc.stdin?.write(JSON.stringify(msg) + "\n");
}

async function main() {
  const arg = process.argv[2];
  const targets = arg ? { [arg]: SERVERS[arg] } : SERVERS;
  const targetEntries = Object.entries(targets).filter(([_, v]) => v);
  if (targetEntries.length === 0) {
    console.error(`unknown server: ${arg}. Valid: ${Object.keys(SERVERS).join(", ")}`);
    process.exit(2);
  }

  console.log(`\n🛡  AuditSentry MCP test — ${targetEntries.length} server(s)\n`);
  console.log(`  ${"server".padEnd(22)} ${"list".padEnd(10)} ${"invoke".padEnd(28)}`);
  console.log(`  ${"-".repeat(22)} ${"-".repeat(10)} ${"-".repeat(28)}`);

  const results: TestResult[] = [];
  for (const [name, spec] of targetEntries) {
    process.stdout.write(`  ${name.padEnd(22)} `);
    const r = await testServer(name, spec);
    results.push(r);
    const list = r.listOk ? `✓ ${r.tools}t`.padEnd(10) : `✗`.padEnd(10);
    const invoke = r.invokeOk
      ? `✓ ${r.invokeTool}`.padEnd(28)
      : (r.totalError ? `✗ ${r.totalError}` : `✗ ${r.invokeTool}: ${r.invokeError}`);
    console.log(`${list} ${invoke}`);
  }

  const okCount = results.filter((r) => r.listOk && r.invokeOk).length;
  const failCount = results.length - okCount;
  console.log(`\n  ${okCount}/${results.length} fully passing  (list + invoke)`);
  if (failCount > 0) process.exit(1);
}

main();
