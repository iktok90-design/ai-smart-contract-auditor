---
description: Audit a deployed contract on a live chain. Pulls verified source from the block explorer, optionally forks the chain for live-state simulation.
argument-hint: "<address> [--chain ethereum] [--block latest]"
allowed-tools: Read, Bash, Agent, Skill, mcp__block-explorer__*, mcp__anvil__*, mcp__forge-runner__*
---

# /audit-live — audit a deployed contract

`$ARGUMENTS` typically: `0xABC...  --chain berachain  --block 12345678`

Supported chains: `ethereum`, `berachain`, `arbitrum`, `base`, `optimism`, `polygon`, `bsc`, `linea`, `zksync`, `scroll`.

## Procedure

### Step 1 — Pull verified source

Use the `block-explorer` MCP:

```
mcp__block-explorer__get_source_code(chain=<chain>, address=<addr>)
mcp__block-explorer__get_abi(chain=<chain>, address=<addr>)
mcp__block-explorer__get_constructor_args(chain=<chain>, address=<addr>)
```

If not verified, abort and tell the user to either verify the contract or supply a local copy of the source.

### Step 2 — Snapshot deployment state

- Owner / admin addresses.
- Total supply, key balances.
- Token addresses the contract holds.

### Step 3 — Identify proxy/upgrade situation

Resolve the proxy pattern in one call (reads EIP-1967/1822 slots for you):

```
mcp__block-explorer__resolve_proxy(chain=<chain>, address=<addr>)
```

It returns `{ isProxy, pattern, implementation, admin, beacon }`. If `isProxy`:
  - Pull the **implementation's** source too (`get_source_code` on `implementation`).
  - Check `_authorizeUpgrade` / admin for centralization (see [[centralization-risk]]).
  - Check storage layout for collisions across the upgrade (see [[storage-layout]]).
  - For a beacon, audit the beacon's upgrade authority; for a Diamond (EIP-2535), inventory facets (see [[diamond-eip2535]]).

### Step 4 — Run /audit on the source

Run the full `/audit` flow with the pulled source. Add deployment-specific findings:

- Owner is an EOA, not a multi-sig.
- Proxy admin overlaps with operational owner.
- Token approvals from the contract to other addresses (audit each).
- On-chain balances inconsistent with state vars (smells like accounting bug or external donation).
- Was this contract's bytecode matched against any historical vulnerable bytecode? Check `c4-history` / `sherlock-history`.

### Step 5 — Live-state simulation (optional)

If `--simulate` is passed or critical findings need verification, spawn an `anvil` fork:

```
mcp__anvil__fork(chain=<chain>, block=<block>)
mcp__forge-runner__exec(forkUrl=<anvil-url>, test=<generated-poc>)
```

For each Critical finding, attempt to instantiate the exploit on the fork.

### Step 6 — Emit report

In addition to the standard `/audit` output:

```
Deployment summary
  Chain:        <chain>
  Address:      <addr>
  Verified:     yes / no
  Proxy:        none / UUPS / Transparent / Beacon / Diamond
  Implementation: <addr>
  Owner / Admin: <addr>  (EOA / Safe-N-of-M / Timelocked / DAO)
  Timelock:     yes (<duration>) / no
  TVL (approx): $X
```

Then findings as usual.

## Notes

- Always read the *currently active* implementation for proxies, not the deployed-as-template impl.
- For chains lacking a verifier-API-key, set `<CHAIN>_API_KEY` env vars (`ETHERSCAN_API_KEY`, `BERATRAIL_API_KEY`, etc.).
- Live audits can be slow — warn the user if pulling many contracts.
