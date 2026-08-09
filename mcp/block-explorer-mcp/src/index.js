#!/usr/bin/env node
/**
 * AuditSentry block-explorer MCP server.
 * Unified interface for Etherscan-family explorers across EVM chains.
 *
 * STATUS: scaffold + working stubs returning realistic mock data.
 * Replace each handler body with a real fetch() to the chain's explorer API.
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema, } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
const EXPLORER_BASE = {
    ethereum: "https://api.etherscan.io/api",
    berachain: "https://api.beratrail.io/api",
    arbitrum: "https://api.arbiscan.io/api",
    base: "https://api.basescan.org/api",
    optimism: "https://api-optimistic.etherscan.io/api",
    polygon: "https://api.polygonscan.com/api",
    bsc: "https://api.bscscan.com/api",
    linea: "https://api.lineascan.build/api",
    zksync: "https://api-era.zksync.network/api",
    scroll: "https://api.scrollscan.com/api",
};
const apiKeyFor = (chain) => {
    const env = {
        ethereum: "ETHERSCAN_API_KEY",
        berachain: "BERATRAIL_API_KEY",
        arbitrum: "ARBISCAN_API_KEY",
        base: "BASESCAN_API_KEY",
        optimism: "OPTIMISTIC_ETHERSCAN_API_KEY",
        polygon: "POLYGONSCAN_API_KEY",
        bsc: "BSCSCAN_API_KEY",
        linea: "LINEASCAN_API_KEY",
        zksync: "ZKSYNC_API_KEY",
        scroll: "SCROLLSCAN_API_KEY",
    };
    return process.env[env[chain]] ?? "";
};
const server = new Server({ name: "auditsentry-block-explorer", version: "0.1.0" }, { capabilities: { tools: {} } });
server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
        {
            name: "get_source_code",
            description: "Fetch verified Solidity source for a deployed contract from the chain explorer.",
            inputSchema: {
                type: "object",
                properties: {
                    chain: { type: "string" },
                    address: { type: "string" },
                },
                required: ["chain", "address"],
            },
        },
        {
            name: "get_abi",
            description: "Fetch ABI for a deployed contract.",
            inputSchema: {
                type: "object",
                properties: {
                    chain: { type: "string" },
                    address: { type: "string" },
                },
                required: ["chain", "address"],
            },
        },
        {
            name: "get_runtime_code",
            description: "Fetch runtime bytecode at a deployed address.",
            inputSchema: {
                type: "object",
                properties: {
                    chain: { type: "string" },
                    address: { type: "string" },
                },
                required: ["chain", "address"],
            },
        },
        {
            name: "get_constructor_args",
            description: "Decoded constructor arguments for a deployed contract.",
            inputSchema: {
                type: "object",
                properties: {
                    chain: { type: "string" },
                    address: { type: "string" },
                },
                required: ["chain", "address"],
            },
        },
        {
            name: "get_storage_at",
            description: "Read storage slot at a deployed address. Useful for EIP-1967 implementation slots.",
            inputSchema: {
                type: "object",
                properties: {
                    chain: { type: "string" },
                    address: { type: "string" },
                    slot: { type: "string" },
                },
                required: ["chain", "address", "slot"],
            },
        },
        {
            name: "get_tx",
            description: "Fetch a transaction by hash with calldata, value, gas, status.",
            inputSchema: {
                type: "object",
                properties: {
                    chain: { type: "string" },
                    hash: { type: "string" },
                },
                required: ["chain", "hash"],
            },
        },
        {
            name: "get_trace",
            description: "Fetch the internal-call trace for a transaction (debug_traceTransaction shape).",
            inputSchema: {
                type: "object",
                properties: {
                    chain: { type: "string" },
                    hash: { type: "string" },
                },
                required: ["chain", "hash"],
            },
        },
    ],
}));
async function fetchExplorer(chain, module, action, extra = {}) {
    const base = EXPLORER_BASE[chain];
    if (!base)
        throw new Error(`unsupported chain: ${chain}`);
    const key = apiKeyFor(chain);
    const params = new URLSearchParams({
        module,
        action,
        apikey: key,
        ...extra,
    });
    const url = `${base}?${params.toString()}`;
    if (!key) {
        return {
            __mock: true,
            __reason: `no API key for ${chain}; returning mock`,
            url,
        };
    }
    try {
        const res = await fetch(url);
        return await res.json();
    }
    catch (err) {
        return { __error: String(err), url };
    }
}
server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const { name, arguments: args } = req.params;
    switch (name) {
        case "get_source_code": {
            const { chain, address } = z.object({
                chain: z.string(), address: z.string(),
            }).parse(args);
            const data = await fetchExplorer(chain, "contract", "getsourcecode", { address });
            if (data.__mock) {
                return mockResult({
                    ContractName: "MockContract",
                    SourceCode: "// SPDX-License-Identifier: MIT\npragma solidity ^0.8.20;\n\ncontract MockContract { /* … real source goes here … */ }",
                    ABI: "[]",
                    CompilerVersion: "v0.8.24+commit.e11b9ed9",
                    OptimizationUsed: "1",
                    Runs: "200",
                    ConstructorArguments: "0x",
                    IsProxy: "false",
                    Implementation: "",
                });
            }
            return { content: [{ type: "text", text: JSON.stringify(data) }] };
        }
        case "get_abi": {
            const { chain, address } = z.object({
                chain: z.string(), address: z.string(),
            }).parse(args);
            const data = await fetchExplorer(chain, "contract", "getabi", { address });
            if (data.__mock)
                return mockResult({ abi: [] });
            return { content: [{ type: "text", text: JSON.stringify(data) }] };
        }
        case "get_runtime_code": {
            const { chain, address } = z.object({
                chain: z.string(), address: z.string(),
            }).parse(args);
            const data = await fetchExplorer(chain, "proxy", "eth_getCode", { address, tag: "latest" });
            if (data.__mock)
                return mockResult({ bytecode: "0x6080604052..." });
            return { content: [{ type: "text", text: JSON.stringify(data) }] };
        }
        case "get_constructor_args": {
            return mockResult({
                args: ["0x0000000000000000000000000000000000000001", "1000000000000000000"],
                abi: [{ name: "owner", type: "address" }, { name: "initialSupply", type: "uint256" }],
            });
        }
        case "get_storage_at": {
            const { chain, address, slot } = z.object({
                chain: z.string(), address: z.string(), slot: z.string(),
            }).parse(args);
            const data = await fetchExplorer(chain, "proxy", "eth_getStorageAt", {
                address, position: slot, tag: "latest",
            });
            if (data.__mock)
                return mockResult({ value: "0x" + "00".repeat(32) });
            return { content: [{ type: "text", text: JSON.stringify(data) }] };
        }
        case "get_tx": {
            const { chain, hash } = z.object({
                chain: z.string(), hash: z.string(),
            }).parse(args);
            const data = await fetchExplorer(chain, "proxy", "eth_getTransactionByHash", { txhash: hash });
            if (data.__mock) {
                return mockResult({
                    hash, from: "0x0", to: "0x0", value: "0x0", gas: "0x5208",
                    input: "0x", blockNumber: "0x100", status: "0x1",
                });
            }
            return { content: [{ type: "text", text: JSON.stringify(data) }] };
        }
        case "get_trace": {
            return mockResult({
                type: "CALL",
                from: "0x0", to: "0x0", value: "0x0", input: "0x", output: "0x",
                calls: [
                    { type: "CALL", from: "0x0", to: "0x1", value: "0x0", input: "0x", output: "0x" },
                ],
            });
        }
        default:
            throw new Error(`unknown tool: ${name}`);
    }
});
function mockResult(obj) {
    return {
        content: [
            {
                type: "text",
                text: JSON.stringify({ __stub: true, data: obj }, null, 2),
            },
        ],
    };
}
const transport = new StdioServerTransport();
await server.connect(transport);
//# sourceMappingURL=index.js.map