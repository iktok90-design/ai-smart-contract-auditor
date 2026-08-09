#!/usr/bin/env node
/**
 * AuditSentry tenderly MCP server.
 * Wraps Tenderly's hosted simulation + fork APIs.
 *
 * STATUS: scaffold — calls real Tenderly if TENDERLY_ACCESS_KEY/ACCOUNT/PROJECT are set,
 * otherwise returns mock data.
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema, } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
const KEY = process.env.TENDERLY_ACCESS_KEY ?? "";
const ACCT = process.env.TENDERLY_ACCOUNT ?? "";
const PROJ = process.env.TENDERLY_PROJECT ?? "";
const BASE = "https://api.tenderly.co/api/v1";
async function tenderlyFetch(path, body) {
    if (!KEY || !ACCT || !PROJ) {
        return { __mock: true, __reason: "Tenderly creds missing" };
    }
    try {
        const res = await fetch(`${BASE}${path}`, {
            method: body ? "POST" : "GET",
            headers: {
                "x-access-key": KEY,
                "content-type": "application/json",
            },
            body: body ? JSON.stringify(body) : undefined,
        });
        return await res.json();
    }
    catch (err) {
        return { __error: String(err) };
    }
}
const server = new Server({ name: "auditsentry-tenderly", version: "0.1.0" }, { capabilities: { tools: {} } });
server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
        {
            name: "simulate",
            description: "Simulate a transaction on Tenderly (no fork persistence).",
            inputSchema: {
                type: "object",
                properties: {
                    chainId: { type: "number" },
                    from: { type: "string" }, to: { type: "string" },
                    value: { type: "string" }, input: { type: "string" }, gas: { type: "number" },
                    blockNumber: { type: "number" },
                },
                required: ["chainId", "from", "to", "input"],
            },
        },
        {
            name: "create_fork",
            description: "Create a Tenderly fork.",
            inputSchema: {
                type: "object",
                properties: { chainId: { type: "number" }, blockNumber: { type: "number" } },
                required: ["chainId"],
            },
        },
        {
            name: "delete_fork",
            description: "Delete a Tenderly fork by id.",
            inputSchema: {
                type: "object",
                properties: { forkId: { type: "string" } },
                required: ["forkId"],
            },
        },
    ],
}));
server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const { name, arguments: args } = req.params;
    if (name === "simulate") {
        const p = z.object({
            chainId: z.number(), from: z.string(), to: z.string(),
            value: z.string().optional(), input: z.string(),
            gas: z.number().optional(), blockNumber: z.number().optional(),
        }).parse(args);
        const data = await tenderlyFetch(`/account/${ACCT}/project/${PROJ}/simulate`, {
            network_id: String(p.chainId),
            from: p.from, to: p.to, value: p.value ?? "0",
            input: p.input, gas: p.gas ?? 5_000_000,
            block_number: p.blockNumber,
            save: true, save_if_fails: true,
        });
        if (data.__mock) {
            return textResult({
                __stub: true,
                simulation: {
                    status: true, gas_used: 287_543,
                    trace: [{ type: "CALL", from: p.from, to: p.to, value: p.value ?? "0" }],
                    dashboardLink: `https://dashboard.tenderly.co/${ACCT}/${PROJ}/simulator/STUB`,
                },
            });
        }
        return textResult(data);
    }
    if (name === "create_fork") {
        const p = z.object({ chainId: z.number(), blockNumber: z.number().optional() }).parse(args);
        const data = await tenderlyFetch(`/account/${ACCT}/project/${PROJ}/fork`, {
            network_id: String(p.chainId), block_number: p.blockNumber,
        });
        if (data.__mock)
            return textResult({ __stub: true, fork_id: "stub-fork-id", rpc: "https://rpc.tenderly.co/fork/STUB" });
        return textResult(data);
    }
    if (name === "delete_fork") {
        const { forkId } = z.object({ forkId: z.string() }).parse(args);
        const data = await tenderlyFetch(`/account/${ACCT}/project/${PROJ}/fork/${forkId}`);
        if (data.__mock)
            return textResult({ __stub: true, deleted: forkId });
        return textResult(data);
    }
    throw new Error(`unknown tool: ${name}`);
});
function textResult(obj) {
    return { content: [{ type: "text", text: JSON.stringify(obj, null, 2) }] };
}
const transport = new StdioServerTransport();
await server.connect(transport);
//# sourceMappingURL=index.js.map