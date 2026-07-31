#!/usr/bin/env node
/**
 * AuditSentry Sherlock history MCP server.
 * Searches Sherlock's audit findings archive.
 *
 * STATUS: scaffold — returns curated mock data; replace with real Sherlock GitHub API fetch.
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema, } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
const SAMPLE = [
    { id: "SHRLK-001", protocol: "Asymmetry afETH", severity: "High", title: "Slippage absent in vault rebalance", vuln: "mev-frontrunning", contest: "afeth-rebalance-2024" },
    { id: "SHRLK-002", protocol: "Eigenpie", severity: "High", title: "Restaking deposit ignores LST depeg", vuln: "restaking-eigenlayer", contest: "eigenpie-2024" },
    { id: "SHRLK-003", protocol: "GMX V2", severity: "Medium", title: "Order keeper can drop user-favorable orders", vuln: "centralization-risk", contest: "gmx-v2-2023" },
    { id: "SHRLK-004", protocol: "Velodrome V2", severity: "High", title: "veNFT vote-weight not snapshotted at proposal", vuln: "flash-loan-attacks", contest: "velo-v2-2023" },
];
const server = new Server({ name: "auditsentry-sherlock-history", version: "0.1.0" }, { capabilities: { tools: {} } });
server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
        {
            name: "search",
            description: "Search Sherlock historical findings.",
            inputSchema: {
                type: "object",
                properties: {
                    protocol: { type: "string" }, vuln: { type: "string" },
                    severity: { type: "string" }, keyword: { type: "string" },
                    limit: { type: "number" },
                },
            },
        },
        {
            name: "get_finding",
            description: "Get full details for one Sherlock finding by id.",
            inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
        },
    ],
}));
server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const { name, arguments: args } = req.params;
    if (name === "search") {
        const p = z.object({
            protocol: z.string().optional(), vuln: z.string().optional(),
            severity: z.string().optional(), keyword: z.string().optional(),
            limit: z.number().optional(),
        }).parse(args ?? {});
        let results = SAMPLE.slice();
        if (p.protocol)
            results = results.filter((x) => x.protocol.toLowerCase().includes(p.protocol.toLowerCase()));
        if (p.vuln)
            results = results.filter((x) => x.vuln === p.vuln);
        if (p.severity)
            results = results.filter((x) => x.severity.toLowerCase() === p.severity.toLowerCase());
        if (p.keyword)
            results = results.filter((x) => x.title.toLowerCase().includes(p.keyword.toLowerCase()) ||
                x.protocol.toLowerCase().includes(p.keyword.toLowerCase()));
        if (p.limit)
            results = results.slice(0, p.limit);
        return textResult({ source: "stub-curated", count: results.length, results });
    }
    if (name === "get_finding") {
        const { id } = z.object({ id: z.string() }).parse(args);
        const f = SAMPLE.find((x) => x.id === id);
        if (!f)
            return textResult({ __error: "not found" });
        return textResult({
            ...f,
            description: `Stub-narrative for ${f.title}. Replace with fetch from sherlock-protocol/sherlock-reports.`,
            url: `https://audits.sherlock.xyz/contests/${f.contest}/${f.id}`,
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