---
description: Diff the on-chain configuration of one contract deployed across multiple chains — owner, oracle, fees, timelock, pause state, proxy impl — and flag the chain that drifted.
argument-hint: "<address> <chain1,chain2,...>"
allowed-tools: Read, Bash, Agent, mcp__block-explorer__*, mcp__anvil__*
---

# /audit-multi-chain — find the chain that's misconfigured

Protocols deploy the same contract to Ethereum, Arbitrum, Base, Optimism… and one chain ends up with the wrong oracle, a forgotten EOA owner, or a paused-forever flag. Configuration drift across chains is a classic, high-severity bug class. This command forks each chain and diffs the live config side by side.

## Procedure

### Step 1 — Parse arguments

`$ARGUMENTS` is `<address> <chain1,chain2,...>`. Split the chain list on commas. Validate each chain has an RPC / explorer entry available.

### Step 2 — Pull source + config per chain

For each chain, fetch verified source and read the live state:

```
mcp__block-explorer__get_source(chain=<chain>, address=<address>)
mcp__anvil__fork(chain=<chain>, address=<address>)
```

Then read each governance-relevant parameter from the forked state (via `anvil` `eth_call`):

- `owner()` / `admin()` / `getRoleMember(DEFAULT_ADMIN_ROLE, 0)`
- oracle address (`priceFeed()`, `oracle()`)
- fee tiers (`feeBps()`, `protocolFee()`)
- timelock duration (`delay()`, `minDelay()`)
- pause state (`paused()`)
- proxy implementation slot (`eip1967.proxy.implementation` = `0x360894...bbc`)
- token allowlist membership for known tokens

### Step 3 — Diff the matrix

Build a parameter × chain matrix. For each parameter, compute the modal (most common) value across chains and flag any chain that deviates. An EOA owner where other chains use a multisig, or a stale oracle, is a drift finding. Dispatch a `defender` review on each flagged divergence to judge whether it is intentional or a misconfiguration.

### Step 4 — Output

```
Multi-chain config drift: 0xVault... across [ethereum, arbitrum, base]

  Parameter            ethereum          arbitrum          base              Drift
  ─────────────────────────────────────────────────────────────────────────────────
  owner                0xSafe…ab (multisig) 0xSafe…ab        0xEOA…f9 (EOA)    ⚠ base
  oracle               0xChainlink…01    0xChainlink…01    0xChainlink…01    ✓
  feeBps               30                30                50                ⚠ base
  timelock delay       172800            172800            0                 ⚠ base
  paused               false             false             true              ⚠ base
  impl (proxy)         0xImplV2…         0xImplV2…         0xImplV1…         ⚠ base (stale)

Verdict: HIGH RISK — base is misconfigured on 5/6 parameters.
  • owner is an EOA, not the multisig used elsewhere → single-key rug surface
  • timelock delay 0 → admin changes are instant
  • impl is V1 while other chains run V2 → unpatched bug may be live on base
```

## Notes

- Modal value = expected; deviations are the signal. Don't assume the majority is correct — confirm with the team which chain is canonical.
- A stale proxy implementation on one chain means a known bug may still be exploitable there even after the "fix" shipped.
- An EOA owner on one chain undermines the multisig security of all the others. See [[centralization-risk]].
- Forks are read-only here; no state is mutated on any real chain.
