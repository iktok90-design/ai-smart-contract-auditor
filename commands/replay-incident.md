---
description: Replay a historical exploit tx (by tx hash) on a fork. Explains step-by-step what the attacker did.
argument-hint: "<chain> <tx-hash>"
allowed-tools: Read, Bash, Agent, mcp__block-explorer__*, mcp__anvil__*, mcp__forge-runner__*
---

# /replay-incident — replay a historical hack

Pulls a real exploit tx from chain, replays it on a fork, and walks through what happened.

Great teaching tool. Also great content — every replay can become a tweet or blog post.

## Procedure

### Step 1 — Fetch the tx

```
mcp__block-explorer__get_tx(chain=<chain>, hash=<hash>)
mcp__block-explorer__get_trace(chain=<chain>, hash=<hash>)
```

Pull the calldata, value, from/to, internal calls, state diff, gas, and block.

### Step 2 — Fork just before the tx

```
mcp__anvil__fork(chain=<chain>, block=<tx_block - 1>)
```

This gives us the pre-attack state.

### Step 3 — Identify the protocol and contracts touched

Pull the verified source of every contract in the trace.

### Step 4 — Replay

```
mcp__anvil__send_raw_tx(<original-tx>)
```

Capture the actual state changes; compare to the live chain post-tx data — should match.

### Step 5 — Annotate the trace

Walk through each internal call:

```
Block 18,234,567 — Curve Finance exploit (2023-07-30)

  External call: 0xattacker → 0xfraxusdc_pool.remove_liquidity_one_coin(...)
    │
    ├─ Internal: pool transfers $1M USDC to attacker
    │   Then calls pool.balanceOf(attacker) for reward accounting...
    │     │
    │     └─ READ-ONLY REENTRANCY: pool state is mid-update during this read
    │
    └─ attacker contract uses the stale read to mint reward shares
        based on the larger-than-real balance
```

### Step 6 — Vuln-class mapping

Map the incident to the [[skills]] taxonomy:

```
Root cause:  read-only reentrancy (skills/reentrancy)
Amplifier:   reward accounting based on token.balanceOf during mid-update
Lesson:      for any oracle/getter call from a reentrant contract, add
             ReentrancyGuard or rely on a settled-state snapshot.
```

### Step 7 — Output

The full walkthrough + a "what to learn" section + (if `--card` flag) a PNG card for sharing.

## Notable replayable incidents to demo

- 2022-04-17: Beanstalk governance flash-loan ($182M)
- 2022-08-01: Nomad bridge replay attack ($190M)
- 2023-07-30: Curve / Vyper compiler reentrancy ($73M)
- 2023-11-22: KyberSwap concentrated liquidity precision ($55M)
- 2024-03-13: Munchables blacklist-able EOA admin ($63M)

Bundle these as `/replay-incident demo-curve` shortcuts.

## Notes

- Replays are non-destructive (fork is local).
- The actual tx hash and trace must match the live chain — verify post-replay.
