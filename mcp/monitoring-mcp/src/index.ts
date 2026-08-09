#!/usr/bin/env node
/**
 * AuditSentry monitoring MCP server.
 * Post-deployment watch helpers: recommend which on-chain events to alert on for
 * a given contract (pure, offline) and scan recent activity for high-severity
 * events (RPC-backed, with an offline sample). Pairs with /pre-deploy + /monitor.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { textResult, stub, isOffline, fetchJSON } from "@auditsentry/mcp-shared";

const RPCS: Record<string, string> = {
  ethereum: "https://eth.llamarpc.com",
  berachain: "https://rpc.berachain.com",
  arbitrum: "https://arb1.arbitrum.io/rpc",
  base: "https://mainnet.base.org",
  optimism: "https://mainnet.optimism.io",
  polygon: "https://polygon-rpc.com",
  bsc: "https://bsc-dataseed.binance.org",
};

// Well-known event topic0 hashes and the alert severity if they fire.
const KNOWN_EVENTS: Record<string, { sig: string; topic0: string; severity: string }> = {
  ownership: { sig: "OwnershipTransferred(address,address)", topic0: "0x8be0079c531659141344cd1fd0a4f28419497f9722a3daafe3b4186f6b6457e0", severity: "critical" },
  upgrade: { sig: "Upgraded(address)", topic0: "0xbc7cd75a20ee27fd9adebab32041f755214dbc6bffa90cc0225b39da2e5c2d3b", severity: "critical" },
  adminChanged: { sig: "AdminChanged(address,address)", topic0: "0x7e644d79422f17c01e4894b5f4f588d331ebfa28653d42ae832dc59e38c9798f", severity: "critical" },
  paused: { sig: "Paused(address)", topic0: "0x62e78cea01bee320cd4e420270b5ea74000d11b0c9f74754ebdbfc544b05a258", severity: "high" },
  unpaused: { sig: "Unpaused(address)", topic0: "0x5db9ee0a495bf2e6ff9c91a7834c1ba4fdd244a5e8aa4e537bd38aeae4b073aa", severity: "medium" },
  roleGranted: { sig: "RoleGranted(bytes32,address,address)", topic0: "0x2f8788117e7eff1d82e926ec794901d17c78024a50270940304540a733656f0d", severity: "high" },
};

interface Monitor { name: string; event: string; topic0: string; severity: string; why: string; }

/** Pure: recommend alert monitors from a contract's detected capabilities. */
function suggestMonitors(caps: {
  hasOwner?: boolean; hasProxy?: boolean; hasPause?: boolean; hasRoles?: boolean; hasMint?: boolean;
}): Monitor[] {
  const out: Monitor[] = [];
  const add = (key: keyof typeof KNOWN_EVENTS, name: string, why: string) => {
    const e = KNOWN_EVENTS[key];
    out.push({ name, event: e.sig, topic0: e.topic0, severity: e.severity, why });
  };
  if (caps.hasOwner !== false) add("ownership", "Ownership transfer", "owner change is the #1 rug / compromise signal");
  if (caps.hasProxy) { add("upgrade", "Implementation upgrade", "logic swapped — re-audit immediately"); add("adminChanged", "Proxy admin change", "admin key rotated"); }
  if (caps.hasPause) { add("paused", "Contract paused", "funds may be frozen"); add("unpaused", "Contract unpaused", "watch for resumed activity"); }
  if (caps.hasRoles) add("roleGranted", "Role granted", "new privileged actor added");
  // Always recommend a value-threshold transfer monitor (no fixed topic — amount-based).
  out.push({ name: "Large transfer", event: "Transfer(address,address,uint256)", topic0: "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef", severity: "high", why: "alert on transfers above a TVL-relative threshold (drain detection)" });
  return out;
}

const SAMPLE_SCAN = {
  flagged: [
    { event: "Upgraded(address)", severity: "critical", blockNumber: "0x10a2b3c", note: "implementation changed — re-audit" },
  ],
  byEvent: { "Transfer(address,address,uint256)": 142, "Approval(address,address,uint256)": 31, "Upgraded(address)": 1 },
  window_blocks: 5000,
};

const server = new Server(
  { name: "auditsentry-monitoring", version: "0.6.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "suggest_monitors",
      description: "Recommend on-chain alert monitors (events + severity) for a contract based on its capabilities. Pure/offline.",
      inputSchema: {
        type: "object",
        properties: {
          hasOwner: { type: "boolean" }, hasProxy: { type: "boolean" },
          hasPause: { type: "boolean" }, hasRoles: { type: "boolean" }, hasMint: { type: "boolean" },
        },
      },
    },
    {
      name: "scan_recent",
      description: "Scan recent logs for a deployed address and flag high-severity events (upgrade/ownership/pause). Offline → labeled sample.",
      inputSchema: {
        type: "object",
        properties: { chain: { type: "string" }, address: { type: "string" }, fromBlock: { type: "string" } },
        required: ["chain", "address"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params;

  if (name === "suggest_monitors") {
    const caps = z.object({
      hasOwner: z.boolean().optional(), hasProxy: z.boolean().optional(),
      hasPause: z.boolean().optional(), hasRoles: z.boolean().optional(), hasMint: z.boolean().optional(),
    }).parse(args ?? {});
    const monitors = suggestMonitors(caps);
    return textResult({ count: monitors.length, monitors });
  }

  if (name === "scan_recent") {
    const { chain, address, fromBlock } = z.object({
      chain: z.string(), address: z.string(), fromBlock: z.string().optional(),
    }).parse(args);
    const rpc = RPCS[chain];
    if (isOffline() || !rpc) {
      return stub(isOffline() ? "offline mode" : `no RPC for chain ${chain}`, { result: SAMPLE_SCAN });
    }
    try {
      const logs = await fetchJSON(rpc, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getLogs", params: [{ address, fromBlock: fromBlock ?? "earliest", toBlock: "latest" }] }),
      });
      const items: any[] = Array.isArray(logs?.result) ? logs.result : [];
      const byTopic = new Map<string, number>();
      const flagged: any[] = [];
      for (const log of items) {
        const t0 = (log.topics?.[0] ?? "").toLowerCase();
        byTopic.set(t0, (byTopic.get(t0) ?? 0) + 1);
        const known = Object.values(KNOWN_EVENTS).find((e) => e.topic0.toLowerCase() === t0);
        if (known && (known.severity === "critical" || known.severity === "high")) {
          flagged.push({ event: known.sig, severity: known.severity, blockNumber: log.blockNumber });
        }
      }
      return textResult({ stub: false, count: items.length, flagged, distinctEvents: byTopic.size });
    } catch (err) {
      return stub(`RPC error: ${String(err)}`, { result: SAMPLE_SCAN });
    }
  }

  throw new Error(`unknown tool: ${name}`);
});

const transport = new StdioServerTransport();
await server.connect(transport);
