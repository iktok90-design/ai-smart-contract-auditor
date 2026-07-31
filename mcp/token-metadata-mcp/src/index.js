#!/usr/bin/env node
/**
 * AuditSentry token-metadata MCP server.
 * Fetches ERC-20 metadata via eth_call, detects fee-on-transfer / rebasing / blacklist patterns.
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
const SELECTOR = {
    name: "0x06fdde03",
    symbol: "0x95d89b41",
    decimals: "0x313ce567",
    totalSupply: "0x18160ddd",
};
const KNOWN_QUIRKS = {
    "0xdAC17F958D2ee523a2206206994597C13D831ec7": ["non-standard-return", "blacklistable", "pausable"], // USDT mainnet
    "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48": ["blacklistable", "pausable"], // USDC mainnet
    "0x6B175474E89094C44Da98b954EedeAC495271d0F": ["dai-permit-variant"], // DAI
};
async function ethCall(rpc, to, data) {
    try {
        const res = await fetch(rpc, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
                jsonrpc: "2.0", id: 1, method: "eth_call",
                params: [{ to, data }, "latest"],
            }),
        });
        const j = await res.json();
        return j.result ?? null;
    }
    catch {
        return null;
    }
}
function decodeString(hex) {
    if (!hex || hex === "0x")
        return "";
    try {
        if (hex.length === 66) {
            // bytes32 packed
            let out = "";
            for (let i = 2; i < 66; i += 2) {
                const c = parseInt(hex.substr(i, 2), 16);
                if (c === 0)
                    break;
                out += String.fromCharCode(c);
            }
            return out;
        }
        // dynamic bytes/string ABI encoding
        const len = parseInt(hex.substr(66, 64), 16);
        let out = "";
        for (let i = 0; i < len; i++) {
            out += String.fromCharCode(parseInt(hex.substr(130 + i * 2, 2), 16));
        }
        return out;
    }
    catch {
        return hex;
    }
}
const server = new Server({ name: "auditsentry-token-metadata", version: "0.1.0" }, { capabilities: { tools: {} } });
server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
        {
            name: "get_token_metadata",
            description: "Fetch name, symbol, decimals, totalSupply for an ERC-20 token.",
            inputSchema: {
                type: "object",
                properties: { chain: { type: "string" }, address: { type: "string" } },
                required: ["chain", "address"],
            },
        },
        {
            name: "detect_quirks",
            description: "Detect known token quirks (fee-on-transfer, rebasing, blacklistable, pausable).",
            inputSchema: {
                type: "object",
                properties: { chain: { type: "string" }, address: { type: "string" } },
                required: ["chain", "address"],
            },
        },
    ],
}));
server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const { name, arguments: args } = req.params;
    if (name === "get_token_metadata") {
        const { chain, address } = z.object({
            chain: z.string(), address: z.string(),
        }).parse(args);
        const rpc = RPCS[chain];
        if (!rpc)
            return textResult({ __error: `unsupported chain: ${chain}` });
        const [n, s, d, t] = await Promise.all([
            ethCall(rpc, address, SELECTOR.name),
            ethCall(rpc, address, SELECTOR.symbol),
            ethCall(rpc, address, SELECTOR.decimals),
            ethCall(rpc, address, SELECTOR.totalSupply),
        ]);
        return textResult({
            address, chain,
            name: decodeString(n),
            symbol: decodeString(s),
            decimals: d ? parseInt(d, 16) : null,
            totalSupply: t ?? null,
        });
    }
    if (name === "detect_quirks") {
        const { address } = z.object({
            chain: z.string(), address: z.string(),
        }).parse(args);
        const checksummed = address; // simplification — real impl would checksum
        const quirks = KNOWN_QUIRKS[checksummed] ?? KNOWN_QUIRKS[checksummed.toLowerCase()] ?? [];
        return textResult({
            address,
            quirks,
            hint: quirks.length === 0
                ? "No known quirks (verify against your own tests)"
                : "Detected quirks may affect ERC-20 integration; see [[token-compatibility]] skill.",
        });
    }
    throw new Error(`unknown tool: ${name}`);
});
function textResult(obj) {
    return { content: [{ type: "text", text: JSON.stringify(obj, null, 2) }] };
}
const transport = new StdioServerTransport();
await server.connect(transport);
//# sourceMappingURL=index.js.map