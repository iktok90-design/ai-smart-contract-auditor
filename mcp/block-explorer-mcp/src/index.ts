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
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { fetchJSON, isOffline } from "@auditsentry/mcp-shared";

type Chain =
  | "ethereum" | "berachain" | "arbitrum" | "base" | "optimism"
  | "polygon" | "bsc" | "linea" | "zksync" | "scroll";

// Etherscan v2 is a single multichain endpoint keyed by chainid with one API
// key. Chains it covers use that path; Berachain (not on Etherscan v2) keeps its
// own Beratrail endpoint.
const ETHERSCAN_V2 = "https://api.etherscan.io/v2/api";

const CHAIN_ID: Record<Chain, number | null> = {
  ethereum: 1,
  arbitrum: 42161,
  base: 8453,
  optimism: 10,
  polygon: 137,
  bsc: 56,
  linea: 59144,
  zksync: 324,
  scroll: 534352,
  berachain: null, // not on Etherscan v2
};

const BERATRAIL_BASE = "https://api.beratrail.io/api";

const server = new Server(
  { name: "auditsentry-block-explorer", version: "0.1.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "get_source_code",
      description:
        "Fetch verified Solidity source for a deployed contract from the chain explorer.",
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
      description:
        "Read storage slot at a deployed address. Useful for EIP-1967 implementation slots.",
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
    {
      name: "resolve_proxy",
      description:
        "Detect the proxy pattern at an address (EIP-1967 transparent/UUPS, EIP-1822 proxiable, beacon) by reading the standard storage slots, and return the implementation/admin/beacon addresses.",
      inputSchema: {
        type: "object",
        properties: {
          chain: { type: "string" },
          address: { type: "string" },
        },
        required: ["chain", "address"],
      },
    },
  ],
}));

// Standard proxy storage slots.
const PROXY_SLOTS = {
  // EIP-1967
  impl: "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc",
  admin: "0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103",
  beacon: "0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50",
  // EIP-1822 UUPS proxiable
  eip1822: "0xc5f16f0fcc639fa48a6947836d9850f504798523bf8c9a3a87d5876cf622bcf7",
};

const ZERO_SLOT = "0x" + "00".repeat(32);

// A storage slot holds a left-padded address in its low 20 bytes.
function slotToAddress(slot: string | undefined): string | null {
  if (!slot || typeof slot !== "string") return null;
  const hex = slot.replace(/^0x/, "").padStart(64, "0");
  const addr = "0x" + hex.slice(24);
  return /^0x0{40}$/.test(addr) ? null : addr;
}

async function fetchExplorer(
  chain: Chain,
  module: string,
  action: string,
  extra: Record<string, string> = {}
): Promise<any> {
  if (!(chain in CHAIN_ID)) throw new Error(`unsupported chain: ${chain}`);

  // Resolve endpoint + key. Etherscan v2 chains share ETHERSCAN_API_KEY.
  const chainId = CHAIN_ID[chain];
  let base: string;
  let key: string;
  const params = new URLSearchParams({ module, action, ...extra });

  if (chainId !== null) {
    base = ETHERSCAN_V2;
    key = process.env.ETHERSCAN_API_KEY ?? "";
    params.set("chainid", String(chainId));
  } else {
    base = BERATRAIL_BASE;
    key = process.env.BERATRAIL_API_KEY ?? "";
  }
  params.set("apikey", key);
  const url = `${base}?${params.toString()}`;

  if (isOffline() || !key) {
    return {
      __mock: true,
      __reason: isOffline() ? "offline mode" : `no API key for ${chain} (set ETHERSCAN_API_KEY)`,
      url: url.replace(/apikey=[^&]*/, "apikey=***"),
    };
  }
  try {
    return await fetchJSON(url, { retries: 3 });
  } catch (err) {
    return { __error: String(err), url: url.replace(/apikey=[^&]*/, "apikey=***") };
  }
}

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params;

  switch (name) {
    case "get_source_code": {
      const { chain, address } = z.object({
        chain: z.string(), address: z.string(),
      }).parse(args);
      const data = await fetchExplorer(chain as Chain, "contract", "getsourcecode", { address });
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
      const data = await fetchExplorer(chain as Chain, "contract", "getabi", { address });
      if (data.__mock) return mockResult({ abi: [] });
      return { content: [{ type: "text", text: JSON.stringify(data) }] };
    }
    case "get_runtime_code": {
      const { chain, address } = z.object({
        chain: z.string(), address: z.string(),
      }).parse(args);
      const data = await fetchExplorer(chain as Chain, "proxy", "eth_getCode", { address, tag: "latest" });
      if (data.__mock) return mockResult({ bytecode: "0x6080604052..." });
      return { content: [{ type: "text", text: JSON.stringify(data) }] };
    }
    case "get_constructor_args": {
      const { chain, address } = z.object({
        chain: z.string(), address: z.string(),
      }).parse(args);
      // Etherscan returns the raw constructor args inside getsourcecode.
      const data = await fetchExplorer(chain as Chain, "contract", "getsourcecode", { address });
      if (!data.__mock && Array.isArray(data.result) && data.result[0]) {
        return { content: [{ type: "text", text: JSON.stringify({
          constructorArguments: data.result[0].ConstructorArguments ?? "0x",
          contractName: data.result[0].ContractName ?? null,
        }) }] };
      }
      return mockResult({
        constructorArguments: "0x" + "00".repeat(32) + "0de0b6b3a7640000",
        decoded: ["0x0000000000000000000000000000000000000001", "1000000000000000000"],
        abi: [{ name: "owner", type: "address" }, { name: "initialSupply", type: "uint256" }],
      });
    }
    case "get_storage_at": {
      const { chain, address, slot } = z.object({
        chain: z.string(), address: z.string(), slot: z.string(),
      }).parse(args);
      const data = await fetchExplorer(chain as Chain, "proxy", "eth_getStorageAt", {
        address, position: slot, tag: "latest",
      });
      if (data.__mock) return mockResult({ value: "0x" + "00".repeat(32) });
      return { content: [{ type: "text", text: JSON.stringify(data) }] };
    }
    case "get_tx": {
      const { chain, hash } = z.object({
        chain: z.string(), hash: z.string(),
      }).parse(args);
      const data = await fetchExplorer(chain as Chain, "proxy", "eth_getTransactionByHash", { txhash: hash });
      if (data.__mock) {
        return mockResult({
          hash, from: "0x0", to: "0x0", value: "0x0", gas: "0x5208",
          input: "0x", blockNumber: "0x100", status: "0x1",
        });
      }
      return { content: [{ type: "text", text: JSON.stringify(data) }] };
    }
    case "get_trace": {
      // debug_traceTransaction needs an archive/trace-enabled node, which the
      // free explorer API tier does not provide — always a labeled stub here.
      // Use the anvil or tenderly MCP for real traces.
      return mockResult({
        __reason: "internal-call traces require a trace-enabled node; use the anvil/tenderly MCP for real traces",
        type: "CALL",
        from: "0x0", to: "0x0", value: "0x0", input: "0x", output: "0x",
        calls: [
          { type: "CALL", from: "0x0", to: "0x1", value: "0x0", input: "0x", output: "0x" },
        ],
      });
    }
    case "resolve_proxy": {
      const { chain, address } = z.object({
        chain: z.string(), address: z.string(),
      }).parse(args);

      const readSlot = async (slot: string): Promise<string | undefined> => {
        const data = await fetchExplorer(chain as Chain, "proxy", "eth_getStorageAt", {
          address, position: slot, tag: "latest",
        });
        if (data.__mock) return undefined;
        return typeof data.result === "string" ? data.result : undefined;
      };

      if (isOffline() || !process.env.ETHERSCAN_API_KEY) {
        return { content: [{ type: "text", text: JSON.stringify({
          __stub: true,
          __reason: "offline or no API key; sample EIP-1967 transparent proxy",
          address,
          isProxy: true,
          pattern: "EIP-1967 (transparent)",
          implementation: "0x000000000000000000000000000000000000bEEF",
          admin: "0x000000000000000000000000000000000000AdA1",
          beacon: null,
        }, null, 2) }] };
      }

      const [impl, admin, beacon, eip1822] = await Promise.all([
        readSlot(PROXY_SLOTS.impl),
        readSlot(PROXY_SLOTS.admin),
        readSlot(PROXY_SLOTS.beacon),
        readSlot(PROXY_SLOTS.eip1822),
      ]);

      const implAddr = slotToAddress(impl) ?? slotToAddress(eip1822);
      const adminAddr = slotToAddress(admin);
      const beaconAddr = slotToAddress(beacon);

      let pattern = "not a proxy";
      if (beaconAddr) pattern = "EIP-1967 (beacon)";
      else if (slotToAddress(impl) && adminAddr) pattern = "EIP-1967 (transparent)";
      else if (slotToAddress(impl)) pattern = "EIP-1967 (UUPS)";
      else if (slotToAddress(eip1822)) pattern = "EIP-1822 (proxiable)";

      return { content: [{ type: "text", text: JSON.stringify({
        address,
        isProxy: pattern !== "not a proxy",
        pattern,
        implementation: implAddr,
        admin: adminAddr,
        beacon: beaconAddr,
        slots: { impl: impl ?? ZERO_SLOT, admin: admin ?? ZERO_SLOT, beacon: beacon ?? ZERO_SLOT },
      }, null, 2) }] };
    }

    default:
      throw new Error(`unknown tool: ${name}`);
  }
});

function mockResult(obj: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({ __stub: true, data: obj }, null, 2),
      },
    ],
  };
}

const transport = new StdioServerTransport();
await server.connect(transport);
