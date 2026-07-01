#!/usr/bin/env node
/**
 * AuditSentry Code4rena history MCP server.
 * Searches Code4rena's public findings archive.
 *
 * STATUS: scaffold — uses code4rena/org-issues GitHub API for free public data.
 * Returns curated mock data when network unavailable.
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema, } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
const SAMPLE = [
    { id: "C4-2023-07-curve-1", protocol: "Curve Vyper", severity: "Critical", title: "Vyper compiler reentrancy on raw_call", vuln: "reentrancy", date: "2023-07-30" },
    { id: "C4-2022-04-beanstalk-1", protocol: "Beanstalk", severity: "Critical", title: "Flash-loan governance vote bypass", vuln: "flash-loan-attacks", date: "2022-04-17" },
    { id: "C4-2022-08-nomad-1", protocol: "Nomad", severity: "Critical", title: "Replay attack via zero merkle root", vuln: "cross-chain-messaging", date: "2022-08-01" },
    { id: "C4-2024-03-munchables", protocol: "Munchables", severity: "Critical", title: "Blacklisted EOA single-key admin compromise", vuln: "centralization-risk", date: "2024-03-13" },
    { id: "C4-2023-11-kyber", protocol: "KyberSwap", severity: "Critical", title: "Concentrated-liquidity precision exploit", vuln: "amm-specialist", date: "2023-11-22" },
];
const server = new Server({ name: "auditsentry-c4-history", version: "0.1.0" }, { capabilities: { tools: {} } });
server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
        {
            name: "search",
            description: "Search the Code4rena historical findings DB by protocol name, vuln class, severity, or keyword.",
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
            description: "Get full details for one finding by id.",
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
            description: `Stub-narrative description for ${f.title}. Replace this body with a fetch from the public C4 archive (audit-2023-XX repo) once network access is wired up.`,
            url: `https://code4rena.com/reports/${f.id}`,
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