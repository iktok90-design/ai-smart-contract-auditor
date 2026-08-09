#!/usr/bin/env node
/**
 * AuditSentry gas-tracker MCP server.
 * Real-time gas prices via eth_gasPrice across major EVM chains.
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema, } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
const RPCS = {
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
async function fetchGasPrice(chain) {
    const url = RPCS[chain];
    if (!url)
        return { chain, gwei: null, raw: null };
    try {
        const res = await fetch(url, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_gasPrice", params: [] }),
        });
        const j = await res.json();
        if (j.result) {
            const wei = BigInt(j.result);
            const gwei = Number(wei / 1000000000n) + Number(wei % 1000000000n) / 1e9;
            return { chain, gwei, raw: j.result };
        }
    }
    catch { }
    return { chain, gwei: null, raw: null };
}
const server = new Server({ name: "auditsentry-gas-tracker", version: "0.1.0" }, { capabilities: { tools: {} } });
server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
        {
            name: "get_gas_price",
            description: "Get current gas price for a chain (in gwei).",
            inputSchema: {
                type: "object",
                properties: { chain: { type: "string" } },
                required: ["chain"],
            },
        },
        {
            name: "get_all_chains",
            description: "Get current gas prices for all supported chains in parallel.",
            inputSchema: { type: "object", properties: {} },
        },
    ],
}));
server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const { name, arguments: args } = req.params;
    if (name === "get_gas_price") {
        const { chain } = z.object({ chain: z.string() }).parse(args);
        return textResult(await fetchGasPrice(chain));
    }
    if (name === "get_all_chains") {
        const all = await Promise.all(Object.keys(RPCS).map(fetchGasPrice));
        return textResult({ chains: all, ts: new Date().toISOString() });
    }
    throw new Error(`unknown tool: ${name}`);
});
function textResult(obj) {
    return { content: [{ type: "text", text: JSON.stringify(obj, null, 2) }] };
}
const transport = new StdioServerTransport();
await server.connect(transport);
//# sourceMappingURL=index.js.map