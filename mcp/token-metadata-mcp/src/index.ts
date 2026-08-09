#!/usr/bin/env node
/**
 * AuditSentry token-metadata MCP server.
 * Fetches ERC-20 metadata via eth_call, detects fee-on-transfer / rebasing / blacklist patterns.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { fetchJSON, isOffline } from "@auditsentry/mcp-shared";

// GoPlus token-security supports these chain ids (public endpoint, no key).
const GOPLUS_CHAIN_ID: Record<string, string> = {
  ethereum: "1", bsc: "56", arbitrum: "42161", base: "8453",
  optimism: "10", polygon: "137", linea: "59144", scroll: "534352", zksync: "324",
};

const RPCS: Record<string, string> = {
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

// Keyed by lowercase address so lookups are case-insensitive regardless of how
// the caller checksums the address.
const KNOWN_QUIRKS: Record<string, string[]> = {
  "0xdac17f958d2ee523a2206206994597c13d831ec7": ["non-standard-return", "blacklistable", "pausable"],   // USDT mainnet
  "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48": ["blacklistable", "pausable"],                          // USDC mainnet
  "0x6b175474e89094c44da98b954eedeac495271d0f": ["dai-permit-variant"],                                 // DAI
  "0x83f20f44975d03b1b09e64809b757c47f942beea": ["rebasing"],                                           // sDAI
  "0xae7ab96520de3a18e5e111b5eaab095312d7fe84": ["rebasing"],                                           // stETH
  "0x9f8f72aa9304c8b593d555f12ef6589cc3a579a2": ["dao-pausable"],                                       // MKR
  "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2": [],                                                     // WETH (clean baseline)
};

async function ethCall(rpc: string, to: string, data: string): Promise<string | null> {
  try {
    const res = await fetch(rpc, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0", id: 1, method: "eth_call",
        params: [{ to, data }, "latest"],
      }),
    });
    const j: any = await res.json();
    return j.result ?? null;
  } catch {
    return null;
  }
}

function decodeString(hex: string | null): string {
  if (!hex || hex === "0x") return "";
  try {
    if (hex.length === 66) {
      // bytes32 packed
      let out = "";
      for (let i = 2; i < 66; i += 2) {
        const c = parseInt(hex.substr(i, 2), 16);
        if (c === 0) break;
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
  } catch {
    return hex;
  }
}

const server = new Server(
  { name: "auditsentry-token-metadata", version: "0.1.0" },
  { capabilities: { tools: {} } }
);

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
    {
      name: "check_safety",
      description:
        "Token safety/rug check via GoPlus token-security (honeypot, fee-on-transfer, mint authority, blacklist, proxy/upgradeable, owner powers). Falls back to the local quirks DB offline.",
      inputSchema: {
        type: "object",
        properties: { chain: { type: "string" }, address: { type: "string" } },
        required: ["chain", "address"],
      },
    },
  ],
}));

// Map a GoPlus token-security response to a compact risk summary.
function summarizeGoPlus(g: any): { flags: Record<string, boolean>; risk: string; notes: string[] } {
  const truthy = (v: unknown) => v === "1" || v === 1 || v === true;
  const flags = {
    honeypot: truthy(g?.is_honeypot),
    feeOnTransfer: truthy(g?.slippage_modifiable) || Number(g?.buy_tax) > 0 || Number(g?.sell_tax) > 0,
    blacklistable: truthy(g?.is_blacklisted) || truthy(g?.can_take_back_ownership) || truthy(g?.blacklist),
    mintable: truthy(g?.is_mintable),
    pausable: truthy(g?.transfer_pausable) || truthy(g?.is_anti_whale),
    proxyUpgradeable: truthy(g?.is_proxy),
    ownerCanModify: truthy(g?.owner_change_balance) || truthy(g?.hidden_owner) || truthy(g?.can_take_back_ownership),
  };
  const notes: string[] = [];
  if (flags.honeypot) notes.push("flagged as honeypot — sells may be blocked");
  if (flags.feeOnTransfer) notes.push(`buy/sell tax present (buy ${g?.buy_tax ?? "?"}, sell ${g?.sell_tax ?? "?"})`);
  if (flags.ownerCanModify) notes.push("owner can modify balances / reclaim ownership — rug risk");
  if (flags.mintable) notes.push("supply is mintable by owner");
  const high = flags.honeypot || flags.ownerCanModify;
  const medium = flags.feeOnTransfer || flags.mintable || flags.blacklistable || flags.proxyUpgradeable;
  return { flags, risk: high ? "high" : medium ? "medium" : "low", notes };
}

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params;

  if (name === "get_token_metadata") {
    const { chain, address } = z.object({
      chain: z.string(), address: z.string(),
    }).parse(args);
    const rpc = RPCS[chain];
    if (!rpc) return textResult({ __error: `unsupported chain: ${chain}` });
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
    const known = KNOWN_QUIRKS[address.toLowerCase()];
    const quirks = known ?? [];
    return textResult({
      address,
      known: known !== undefined,
      quirks,
      hint: known === undefined
        ? "Address not in the known-quirks DB — verify ERC-20 behaviour against your own tests."
        : quirks.length === 0
          ? "Known token with no integration-breaking quirks."
          : "Detected quirks may affect ERC-20 integration; see [[token-compatibility]] skill.",
    });
  }

  if (name === "check_safety") {
    const { chain, address } = z.object({
      chain: z.string(), address: z.string(),
    }).parse(args);

    const goplusId = GOPLUS_CHAIN_ID[chain];
    const known = KNOWN_QUIRKS[address.toLowerCase()];

    // Offline / unsupported chain → derive a best-effort summary from the local
    // quirks DB so the tool always returns something useful.
    if (isOffline() || !goplusId) {
      const q = known ?? [];
      const flags = {
        honeypot: false,
        feeOnTransfer: q.includes("fee-on-transfer"),
        blacklistable: q.includes("blacklistable"),
        mintable: false,
        pausable: q.includes("pausable"),
        proxyUpgradeable: false,
        ownerCanModify: q.includes("blacklistable") || q.includes("pausable"),
        rebasing: q.includes("rebasing"),
      };
      return textResult({
        address, chain, source: "offline-quirks",
        known: known !== undefined,
        risk: flags.ownerCanModify ? "medium" : "low",
        flags,
        notes: isOffline() ? ["offline mode: GoPlus not queried"] : [`chain ${chain} not covered by GoPlus`],
      });
    }

    try {
      const url = `https://api.gopluslabs.io/api/v1/token_security/${goplusId}?contract_addresses=${address.toLowerCase()}`;
      const j = await fetchJSON(url, { retries: 3 });
      const g = j?.result?.[address.toLowerCase()];
      if (!g) {
        return textResult({ address, chain, source: "goplus", risk: "unknown", notes: ["GoPlus returned no data for this address"] });
      }
      const { flags, risk, notes } = summarizeGoPlus(g);
      return textResult({ address, chain, source: "goplus", risk, flags, notes, token_name: g.token_name, token_symbol: g.token_symbol });
    } catch (err) {
      return textResult({ address, chain, source: "goplus", risk: "unknown", __error: String(err) });
    }
  }

  throw new Error(`unknown tool: ${name}`);
});

function textResult(obj: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(obj, null, 2) }] };
}

const transport = new StdioServerTransport();
await server.connect(transport);
