#!/usr/bin/env node
/**
 * AuditSentry anvil MCP server.
 * Spins up local anvil forks of any RPC; offers JSON-RPC over the MCP boundary.
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema, } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { spawn } from "node:child_process";
const RPC_DEFAULTS = {
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
const forks = new Map();
let nextPort = 8545;
const server = new Server({ name: "auditsentry-anvil", version: "0.1.0" }, { capabilities: { tools: {} } });
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
async function rpc(url, method, params) {
    try {
        const res = await fetch(url, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
        });
        return await res.json();
    }
    catch (err) {
        return { __error: String(err) };
    }
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
        const fa = ["--fork-url", upstream, "--port", String(port)];
        if (block && block !== "latest")
            fa.push("--fork-block-number", block);
        const proc = spawn("anvil", fa, { detached: false, env: process.env });
        proc.stdout?.on("data", () => { });
        proc.stderr?.on("data", () => { });
        const url = `http://127.0.0.1:${port}`;
        await new Promise((r) => setTimeout(r, 1500)); // anvil takes ~1s to be ready
        forks.set(id, { proc, url, chain, block: block ?? "latest" });
        return textResult({ id, url, chain, block: block ?? "latest" });
    }
    if (name === "kill_fork") {
        const { id } = z.object({ id: z.string() }).parse(args);
        const f = forks.get(id);
        if (!f)
            return textResult({ __error: "no such fork" });
        try {
            f.proc.kill();
        }
        catch { }
        forks.delete(id);
        return textResult({ killed: id });
    }
    if (name === "send_raw_tx") {
        const { id, rawTx } = z.object({ id: z.string(), rawTx: z.string() }).parse(args);
        const f = forks.get(id);
        if (!f)
            return textResult({ __error: "no such fork" });
        return textResult(await rpc(f.url, "eth_sendRawTransaction", [rawTx]));
    }
    if (name === "snapshot") {
        const { id } = z.object({ id: z.string() }).parse(args);
        const f = forks.get(id);
        if (!f)
            return textResult({ __error: "no such fork" });
        return textResult(await rpc(f.url, "evm_snapshot", []));
    }
    if (name === "revert") {
        const { id, snapshot } = z.object({ id: z.string(), snapshot: z.string() }).parse(args);
        const f = forks.get(id);
        if (!f)
            return textResult({ __error: "no such fork" });
        return textResult(await rpc(f.url, "evm_revert", [snapshot]));
    }
    if (name === "list_forks") {
        const out = Array.from(forks.entries()).map(([id, v]) => ({ id, ...v, proc: undefined }));
        return textResult({ forks: out });
    }
    throw new Error(`unknown tool: ${name}`);
});
function textResult(obj) {
    return { content: [{ type: "text", text: JSON.stringify(obj, null, 2) }] };
}
process.on("exit", () => { for (const f of forks.values())
    try {
        f.proc.kill();
    }
    catch { } });
const transport = new StdioServerTransport();
await server.connect(transport);
//# sourceMappingURL=index.js.map