#!/usr/bin/env node
/**
 * AuditSentry anvil MCP server.
 * Spins up local anvil forks of any RPC; offers JSON-RPC over the MCP boundary.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { spawn, ChildProcess } from "node:child_process";

const RPC_DEFAULTS: Record<string, string> = {
  ethereum: "https://eth.llamarpc.com",
  berachain: "https://rpc.berachain.com",
  arbitrum: "https://arb1.arbitrum.io/rpc",
  base: "https://mainnet.base.org",
  optimism: "https://mainnet.optimism.io",
  polygon: "https://polygon-rpc.com",
  bsc: "https://bsc-dataseed.binance.org",
  linea: "https://rpc.linea.build",
  zksync: "https://mainnet.era.zksync.io",
  scroll: "https://rpc.scroll.io",
};

const forks = new Map<string, { proc: ChildProcess; url: string; chain: string; block: string }>();
let nextPort = 8545;

const server = new Server(
  { name: "auditsentry-anvil", version: "0.1.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "fork",
      description: "Spin up an anvil fork of the given chain at the given block (or latest). Returns RPC URL.",
      inputSchema: {
        type: "object",
        properties: {
          chain: { type: "string", description: "ethereum|berachain|arbitrum|base|..." },
          block: { type: "string", description: "block number or 'latest'" },
          rpcUrl: { type: "string", description: "override RPC endpoint" },
        },
        required: ["chain"],
      },
    },
    {
      name: "kill_fork",
      description: "Kill an anvil fork by id.",
      inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
    },
    {
      name: "send_raw_tx",
      description: "Send a signed raw transaction to a fork (eth_sendRawTransaction).",
      inputSchema: {
        type: "object",
        properties: { id: { type: "string" }, rawTx: { type: "string" } },
        required: ["id", "rawTx"],
      },
    },
    {
      name: "snapshot",
      description: "Take a snapshot of the fork state (returns snapshot id).",
      inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
    },
    {
      name: "revert",
      description: "Revert the fork to a snapshot.",
      inputSchema: {
        type: "object",
        properties: { id: { type: "string" }, snapshot: { type: "string" } },
        required: ["id", "snapshot"],
      },
    },
    {
      name: "list_forks",
      description: "List active forks.",
      inputSchema: { type: "object", properties: {} },
    },
  ],
}));

async function rpc(url: string, method: string, params: unknown[]): Promise<any> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    });
    return await res.json();
  } catch (err) {
    return { __error: String(err) };
  }
}

/**
 * Poll the anvil JSON-RPC until it answers eth_blockNumber or the deadline
 * passes. Replaces a fixed sleep so we don't race a slow fork (or waste time on
 * a fast one). Returns true once anvil is serving requests.
 */
async function waitForRpc(url: string, timeoutMs = 20000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const r = await rpc(url, "eth_blockNumber", []);
    if (r && typeof r.result === "string") return true;
    await new Promise((res) => setTimeout(res, 250));
  }
  return false;
}

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params;

  if (name === "fork") {
    const { chain, block, rpcUrl } = z.object({
      chain: z.string(),
      block: z.string().optional(),
      rpcUrl: z.string().optional(),
    }).parse(args);
    const port = nextPort++;
    const id = `fork-${Date.now()}-${port}`;
    const upstream = rpcUrl ?? RPC_DEFAULTS[chain];
    if (!upstream) {
      return textResult({ __error: `no RPC for chain ${chain}; pass rpcUrl explicitly` });
    }
    const fa: string[] = ["--fork-url", upstream, "--port", String(port)];
    if (block && block !== "latest") fa.push("--fork-block-number", block);
    const proc = spawn("anvil", fa, { detached: false, env: process.env });
    proc.stdout?.on("data", () => {});
    proc.stderr?.on("data", () => {});
    const url = `http://127.0.0.1:${port}`;
    const ready = await waitForRpc(url, 20000);
    if (!ready) {
      try { proc.kill(); } catch {}
      return textResult({
        __error: `anvil did not become ready within 20s on ${url}`,
        hint: "is `anvil` on PATH? is the fork RPC reachable?",
      });
    }
    forks.set(id, { proc, url, chain, block: block ?? "latest" });
    return textResult({ id, url, chain, block: block ?? "latest", ready });
  }

  if (name === "kill_fork") {
    const { id } = z.object({ id: z.string() }).parse(args);
    const f = forks.get(id);
    if (!f) return textResult({ __error: "no such fork" });
    try { f.proc.kill(); } catch {}
    forks.delete(id);
    return textResult({ killed: id });
  }

  if (name === "send_raw_tx") {
    const { id, rawTx } = z.object({ id: z.string(), rawTx: z.string() }).parse(args);
    const f = forks.get(id);
    if (!f) return textResult({ __error: "no such fork" });
    return textResult(await rpc(f.url, "eth_sendRawTransaction", [rawTx]));
  }

  if (name === "snapshot") {
    const { id } = z.object({ id: z.string() }).parse(args);
    const f = forks.get(id);
    if (!f) return textResult({ __error: "no such fork" });
    return textResult(await rpc(f.url, "evm_snapshot", []));
  }

  if (name === "revert") {
    const { id, snapshot } = z.object({ id: z.string(), snapshot: z.string() }).parse(args);
    const f = forks.get(id);
    if (!f) return textResult({ __error: "no such fork" });
    return textResult(await rpc(f.url, "evm_revert", [snapshot]));
  }

  if (name === "list_forks") {
    const out = Array.from(forks.entries()).map(([id, v]) => ({ id, ...v, proc: undefined }));
    return textResult({ forks: out });
  }

  throw new Error(`unknown tool: ${name}`);
});

function textResult(obj: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(obj, null, 2) }] };
}

process.on("exit", () => { for (const f of forks.values()) try { f.proc.kill(); } catch {} });

const transport = new StdioServerTransport();
await server.connect(transport);
