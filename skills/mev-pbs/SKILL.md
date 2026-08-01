---
name: mev-pbs
description: Detect MEV and proposer-builder-separation exposure — sandwichable swaps with no minOut, JIT liquidity, oracle-update frontrunning, backrunnable state, false reliance on private mempools, builder censorship, missing commit-reveal, and multi-block MEV post-PBS. Activate whenever code performs swaps/liquidations/auctions/redemptions whose ordering or price is observable in the public mempool before execution.
---

# MEV / PBS risk detection

## When this applies

Trigger on any of:

- Swaps, mints, or redemptions priced from a spot source without slippage bounds
- Liquidations, auctions, or rebalances triggerable by anyone observing the mempool
- Logic assuming transactions land via a private orderflow (Flashbots Protect, MEV-Share)
- Reveal-then-act flows with no commit phase
- Reward/airdrop claims, NFT mints, or oracle pushes that are frontrun-profitable
- Time- or block-sensitive state an attacker can backrun

## Detection patterns

### Sandwichable swap, no minOut (HIGH)
```solidity
function swap(uint256 amountIn) external {
    uint256 out = router.swapExactTokensForTokens(amountIn, 0, path, ...);
    //                                                      ^ minOut = 0
}
```
**Signal:** `amountOutMin == 0` (or a deadline of `type(uint).max`) lets a searcher frontrun to move price, then backrun, extracting the full slippage. The user-facing call must accept a caller-supplied `minOut` and `deadline`, never hardcode 0.

### Oracle-update frontrunning (HIGH)
A position becomes profitable to liquidate / mint the instant a Chainlink push or `updatePrice` lands. Searchers backrun the oracle tx in the same block. If your protocol grants the *liquidator* a fixed bonus, the value leaks to MEV; if redemptions price off a freshly-updated feed, frontrun the update.

### JIT liquidity (MEDIUM)
Concentrated-liquidity add-just-before / remove-just-after a large swap captures fees from passive LPs without bearing inventory risk. Flag fee mechanics that reward liquidity present only at swap time.

### False private-mempool assumption (HIGH)
```solidity
// comment: "safe because we submit via Flashbots, never public"
```
**Signal:** security argument rests on transactions staying private. Private relays are best-effort, not guaranteed; post-PBS, builders may not include or may leak the bundle. On-chain logic must be safe even when public.

### Missing commit-reveal (MEDIUM)
Auctions, randomness consumers, or fair-mints that reveal the winning input in the same tx are frontrunnable. No commit phase = bid sniping.

### Multi-block / backrunnable state (MEDIUM)
Post-Merge, a proposer controlling consecutive slots can execute multi-block MEV (e.g. hold price across two blocks). State that's only manipulation-safe within a single block is not safe under multi-block control.

## Severity rubric

| Pattern | Severity | Notes |
|---|---|---|
| minOut=0 / max deadline on user swap | **High** | Guaranteed sandwich loss |
| Oracle-update frontrun → liquidation/redemption | **High** | Value leaks to searchers |
| Security relies on private mempool | **High** | Assumption not enforceable on-chain |
| Missing commit-reveal on auction/mint | **Medium** | Bid sniping |
| JIT liquidity fee capture | **Medium** | LP value extraction |
| Single-block-only safety vs multi-block MEV | **Medium** | Proposer with consecutive slots |

## Remediation patterns

1. **Caller-supplied `minOut` + `deadline`** on every swap/redeem; reject 0 / `type(uint).max` defaults.
2. **Commit-reveal** for auctions, fair mints, and randomness consumption; or a sealed-bid scheme.
3. **Decouple action from oracle tick** — use TWAPs / time-weighted settlement so a single update isn't instantly exploitable; cap per-block price movement.
4. **Don't rely on privacy for safety** — treat the mempool as adversarial; if using MEV-Share/threshold encryption, still make on-chain logic safe when public.
5. **Multi-block-aware design** — require state to be safe across consecutive proposer slots; consider per-epoch rate limits.

## False-positive notes

- A swap whose `minOut` is computed off-chain from a fresh quote and passed in is fine — don't flag the presence of a slippage parameter.
- Functions gated to a trusted keeper/relayer with no public-mempool exposure narrow (not eliminate) the risk; note rather than escalate.
- Pure view/quote functions carry no MEV.

## Related

- [[mev-frontrunning]] — overlapping general frontrunning patterns
- [[oracle-manipulation]] — spot-price moves are the substrate for sandwiches
- [[flash-loan-attacks]] — sandwich capital is often flash-borrowed
