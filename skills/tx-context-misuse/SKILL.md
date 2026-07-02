---
name: tx-context-misuse
description: Detect misuse of tx.origin, block.timestamp, block.number — phishing via tx.origin, timestamp dependence, L2-block-number assumptions. Activate on `tx.origin`, `block.timestamp`, `block.number`, `blockhash`, `block.prevrandao`, `block.coinbase`.
---

# tx.origin / timestamp / block-number misuse

## When this applies

- Auth checks using `tx.origin`
- Time-based logic (lockups, deadlines, vesting, auctions)
- Block-number-based rate limits or cooldowns
- L2 deployments where block semantics differ from L1
- Randomness derived from block data

## Detection patterns

### `tx.origin` for authorization (HIGH)
```solidity
require(tx.origin == owner);   // ← phishable via intermediate contract
```
A contract the owner has interacted with can drain by calling back into this function — owner-EOA is `tx.origin` even if direct caller is the malicious contract.

Exception: `tx.origin == msg.sender` check to enforce EOA-only is *sometimes* valid for limiting bots — but EIP-7702 will invalidate even this. Flag as outdated pattern.

### `block.timestamp` for high-precision deadlines (MEDIUM)
Miners (post-merge: validators) can skew timestamp ±~15s. Don't use for sub-15s precision.

### `block.timestamp` as randomness (HIGH)
```solidity
uint r = uint(keccak256(abi.encode(block.timestamp, msg.sender)));   // ← validator can simulate
```

### `block.number` on L2 (HIGH)
Arbitrum: `block.number` is L1 block number, NOT L2. `block.timestamp` is L2. Optimism: `block.number` is L2. Get this wrong and rate limits fire 12x too fast (or too slow).

### `blockhash(n)` with `n` outside `[block.number-256, block.number-1]` returns 0 (MEDIUM)
Random distribution becomes biased / predictable.

### `block.coinbase` (validator address) used in logic (HIGH)
Validator can rotate addresses; using coinbase for auth or whitelisting is unsafe.

### `block.prevrandao` for high-value randomness (HIGH)
Post-merge `prevrandao` is the previous block's randao; validators can sometimes choose to skip producing a block to influence it (limited but real). Don't use for valuable mints.

### `block.basefee` as anti-MEV gate (LOW-MEDIUM)
Basefee can be manipulated within bounds by miners. Use sparingly.

### Timestamp-based vesting cliffs (LOW)
Generally fine, but document tolerance for ±15s.

## Severity rubric

| Pattern | Severity |
|---|---|
| `tx.origin == admin` for sensitive auth | **High** |
| `block.timestamp` as RNG seed for valuable outcomes | **High** |
| `block.number` confused L1-vs-L2 on Arbitrum | **High** |
| `block.coinbase` for auth | **High** |
| `block.prevrandao` for high-value mint | **High** |
| Timestamp deadline with <30s precision | **Medium** |
| `blockhash` with out-of-range input | **Medium** |
| EOA-only check via `tx.origin == msg.sender` | **Medium** *(EIP-7702 invalidates)* |

## Remediation patterns

- Auth: always `msg.sender`. If you need to know "is this caller a contract", check `caller.code.length > 0` but understand its limits.
- Randomness: Chainlink VRF or commit-reveal.
- L2 block-number: use chain-specific helper (`ArbSys.arbBlockNumber()` on Arbitrum, `block.number` on Optimism).
- Timestamps: round to ~minute granularity for fairness-sensitive flows.
- Validators-can-skew tolerance: bake in slack in deadlines (≥1 minute).

## False-positive notes

- `block.timestamp` for week/month-scale vesting → fine.
- `tx.origin` in events for analytics → fine, not used for auth.
- L2 chain-id detection via `block.chainid` is correct (always returns the canonical chain id).

## Related

- [[mev-frontrunning]] — randomness/RNG
- [[access-control]]
- [[signature-replay]]
