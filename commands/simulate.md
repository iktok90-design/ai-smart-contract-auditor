---
description: Multi-actor, multi-block simulation against a live fork. Stateful attack sequences across many txs.
argument-hint: "<chain> [<address>]  [--block latest]"
allowed-tools: Read, Write, Bash, Agent, mcp__block-explorer__*, mcp__anvil__*, mcp__tenderly__*, mcp__forge-runner__*
---

# /simulate — full mainnet-fork audit

Deeper than `/exploit-live`. Reasons about the protocol across multiple blocks, multiple actors (attacker, victim, MEV searcher, governance, oracle), and multi-step attack sequences.

## When to use

- Protocol has cross-contract state machines (e.g. lending → liquidation → AMM swap).
- Exploits depend on time progression (oracle TWAP windows, vesting cliffs, governance delays).
- You need to verify a multi-block attack actually composes on real state.

## Procedure

### Step 1 — Spin up the fork

Default: `anvil` via the `anvil-mcp`. If the user has Tenderly configured, prefer that for richer trace data.

### Step 2 — Define actors

Set up multiple addresses with realistic balances:

```
attacker:   1 ETH, 0 tokens
victim:     10 ETH (already deposited into target)
mev:        100 ETH (front-running searcher)
governance: timelock controller
oracle:     mock or live Chainlink feed
```

### Step 3 — Generate attack sequences

Dispatch the `attacker` subagent with the audit findings. It produces a sequence:

```
Block N:
  - attacker: take flash loan from Aave  (1M USDC)
  - attacker: deposit into target vault
  - attacker: trigger price update via swap

Block N+1:
  - attacker: liquidate victim at manipulated price
  - attacker: repay flash loan, keep collateral
```

### Step 4 — Run

Execute each step via the fork. Capture:
- Per-step state transitions (balances, allowances, oracle prices, vault shares)
- Gas costs
- Total value extracted

### Step 5 — Output

```
Simulation: berachain-fork @ block 12345678

Attack sequence:
  Block 12345678  [attacker] Flash-borrow 1M USDC                  ✓ gas 215K
  Block 12345678  [attacker] Deposit to Vault (10K shares minted)  ✓ gas 87K
  Block 12345678  [attacker] Manipulate oracle via AMM swap        ✓ gas 142K
  Block 12345679  [attacker] Liquidate victim @ stale price        ✓ gas 256K
  Block 12345679  [attacker] Repay flash loan                      ✓ gas 32K

Net P&L:
  attacker:  +12.4 ETH ($31,200)
  victim:    -10.0 ETH (liquidated)
  protocol:   -2.4 ETH (bad debt absorbed)

Conclusion:
  EXPLOITABLE — full attack sequence successful, protocol incurs bad debt.
  Recommend: TWAP oracle (30min window) + per-block deposit/liquidate cooldown.
```

## Notes

- Don't fabricate attacks — only simulate things you can actually run.
- For Tenderly users, link to the simulation URL — it has a stunning UI for state diffs.
- For Anvil users, save the trace to `auditsentry-reports/sim-traces/`.
