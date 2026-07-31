import { test } from "node:test";
import assert from "node:assert/strict";
import { callServer, hasServer } from "./_rpc.mjs";

// Per-server: expected tool names + one deterministic offline invocation.
// All invocations are chosen so they do NOT require network/keys/binaries — the
// server must fall back to labeled stub/in-memory data.
const CASES = [
  {
    name: "block-explorer",
    expectTools: ["get_source_code", "get_abi", "get_runtime_code", "get_constructor_args", "get_storage_at", "get_tx", "get_trace", "resolve_proxy"],
    tool: "get_constructor_args",
    args: { chain: "ethereum", address: "0x0000000000000000000000000000000000000001" },
    check: (j) => assert.ok("constructorArguments" in j || j.__stub, "expected constructor args or stub"),
  },
  {
    name: "anvil",
    expectTools: ["fork", "kill_fork", "send_raw_tx", "snapshot", "revert", "list_forks"],
    tool: "list_forks",
    args: {},
    check: (j) => assert.ok(Array.isArray(j.forks), "expected forks array"),
  },
  {
    name: "tenderly",
    expectTools: ["simulate", "create_fork", "delete_fork"],
    tool: "create_fork",
    args: { chainId: 1 },
    check: (j) => assert.ok(j.__stub === true || "fork_id" in j, "expected stub fork"),
  },
  {
    name: "c4-history",
    expectTools: ["search", "get_finding", "refresh_cache"],
    tool: "search",
    args: { vuln: "reentrancy", limit: 3 },
    check: (j) => {
      assert.ok(Array.isArray(j.results), "expected results array");
      assert.ok(j.results.every((r) => r.vuln && r.severity), "findings have vuln+severity");
    },
  },
  {
    name: "sherlock-history",
    expectTools: ["search", "get_finding", "refresh_cache"],
    tool: "search",
    args: { keyword: "oracle", limit: 3 },
    check: (j) => assert.ok(Array.isArray(j.results), "expected results array"),
  },
  {
    name: "token-metadata",
    expectTools: ["get_token_metadata", "detect_quirks"],
    tool: "detect_quirks",
    // USDT, checksummed — must resolve case-insensitively (Phase 0 fix).
    args: { chain: "ethereum", address: "0xdAC17F958D2ee523a2206206994597C13D831ec7" },
    check: (j) => {
      assert.equal(j.known, true, "USDT should be a known token");
      assert.ok(j.quirks.includes("blacklistable"), "USDT is blacklistable");
    },
  },
  {
    name: "forge-runner",
    expectTools: ["build", "test", "gas_report", "coverage", "inspect_storage", "exec"],
    tool: null, // invoking forge may run a real binary; just verify tool listing here
  },
  {
    name: "hardhat-runner",
    expectTools: ["compile", "test", "run"],
    tool: null,
  },
  {
    name: "gas-tracker",
    expectTools: ["get_gas_price"],
    tool: null, // needs RPC; offline invocation is non-deterministic
    minTools: 1,
  },
  {
    name: "slither-runner",
    expectTools: ["analyze", "is_available"],
    tool: "analyze",
    args: { target: "examples/VulnerableVault.sol" },
    check: (j) => {
      assert.equal(j.stub, true, "offline -> stub");
      assert.ok(j.slither?.results?.detectors?.length > 0, "sample has detectors");
    },
  },
  {
    name: "mythril-runner",
    expectTools: ["analyze", "is_available"],
    tool: "analyze",
    args: { target: "examples/VulnerableVault.sol" },
    check: (j) => {
      assert.equal(j.stub, true, "offline -> stub");
      assert.ok(j.mythril?.issues?.length > 0, "sample has issues");
    },
  },
  {
    name: "fuzz-runner",
    expectTools: ["echidna", "medusa", "halmos", "is_available"],
    tool: "halmos",
    args: {},
    check: (j) => {
      assert.equal(j.stub, true, "offline -> stub");
      assert.ok(Array.isArray(j.result?.results), "halmos sample has results");
    },
  },
  {
    name: "monitoring",
    expectTools: ["suggest_monitors", "scan_recent"],
    tool: "suggest_monitors",
    args: { hasOwner: true, hasProxy: true, hasPause: true },
    check: (j) => {
      assert.ok(Array.isArray(j.monitors) && j.monitors.length > 0, "returns monitors");
      const events = j.monitors.map((m) => m.event);
      assert.ok(events.some((e) => e.startsWith("Upgraded")), "proxy → upgrade monitor");
      assert.ok(events.some((e) => e.startsWith("OwnershipTransferred")), "owner → ownership monitor");
      assert.ok(j.monitors.some((m) => m.severity === "critical"), "has a critical monitor");
    },
  },
];

for (const c of CASES) {
  test(`${c.name}: lists tools${c.tool ? " + offline invoke" : ""}`, async () => {
    if (!hasServer(c.name)) {
      assert.fail(`server dist missing for ${c.name} — run \`npm run build\` in mcp/`);
    }
    const { tools, invokeText, error } = await callServer(c.name, c.tool, c.args);
    assert.equal(error, null, `handshake error: ${error}`);

    if (c.expectTools) {
      for (const t of c.expectTools) {
        assert.ok(tools.includes(t), `${c.name} should expose tool "${t}" (got: ${tools.join(", ")})`);
      }
    }
    if (c.minTools) assert.ok(tools.length >= c.minTools);

    if (c.tool) {
      assert.ok(invokeText, `${c.name}.${c.tool} returned empty text`);
      const j = JSON.parse(invokeText);
      c.check(j);
    }
  });
}

test("block-explorer resolve_proxy: offline returns a labeled proxy sample", async () => {
  const { invokeText, error } = await callServer("block-explorer", "resolve_proxy", {
    chain: "ethereum",
    address: "0x0000000000000000000000000000000000000001",
  });
  assert.equal(error, null);
  const j = JSON.parse(invokeText);
  assert.equal(j.isProxy, true);
  assert.match(j.pattern, /EIP-1967/);
  assert.ok(j.implementation, "has an implementation address");
});

test("token-metadata check_safety: offline falls back to quirks DB with a risk level", async () => {
  const { invokeText, error } = await callServer("token-metadata", "check_safety", {
    chain: "ethereum",
    address: "0xdAC17F958D2ee523a2206206994597C13D831ec7", // USDT
  });
  assert.equal(error, null);
  const j = JSON.parse(invokeText);
  assert.equal(j.source, "offline-quirks");
  assert.ok(["low", "medium", "high"].includes(j.risk));
  assert.equal(j.flags.blacklistable, true); // USDT is blacklistable in the quirks DB
});
