---
name: mev-frontrunning
description: Detect MEV exposure and front-running risks — sandwich attacks, missing commit-reveal, missing/manipulable deadlines, slippage absent, public mempool dependence. Activate on swaps, mints, liquidations, NFT mints with reveals, auctions, and any function whose ordering can extract value.
---

# MEV / front-running detection

## When this applies

- Swaps, mints, redemptions on AMMs / vaults
- NFT mints with random/reveal mechanics
- Auctions, Dutch auctions, English auctions
- Liquidations
- Trade routers
- DEX aggregator paths
- Any function with `amountOutMin` or slippage parameters

## Detection patterns

### Missing slippage parameter (HIGH)
```solidity
function swap(address tokenIn, uint256 amountIn) external {
    router.swapExactTokensForTokens(amountIn, 0, path, msg.sender, block.timestamp);
    //                                       ^ amountOutMin = 0 → 100% sandwichable
}
```

### Manipulable deadline (HIGH)
```solidity
router.swap(..., block.timestamp);   // ← deadline = now means no deadline at all
```
Searcher can delay your tx indefinitely. Use a real deadline (`block.timestamp + 15 min` or user-supplied).

### Permit + transferFrom front-running (MEDIUM)
Submitting `permit()` separately from the consuming tx lets an MEV bot front-run the permit and grief the user. Bundle in one tx.

### Reveal-based randomness without commit-reveal (HIGH)
```solidity
function mintRare() external {
    uint256 r = uint256(keccak256(abi.encode(block.timestamp, msg.sender)));
    if (r % 100 == 0) _mint(msg.sender, RARE_ID);   // ← searcher can simulate and skip
}
```
Searcher simulates → only sends tx if outcome is favorable. Use commit-reveal or Chainlink VRF.

### `block.prevrandao` / `block.difficulty` for randomness (HIGH)
Proposer can manipulate post-merge `prevrandao` within bounded ranges; predictable enough for valuable mints.

### NFT mint without per-tx limits + public sale (MEDIUM)
Bots will sweep entire allocation. Not a vuln per se but a UX/fairness issue worth flagging.

### Just-in-time (JIT) liquidity exposure (LOW)
LPs in concentrated-liquidity pools can be JIT'd. Inform user, not a fix.

### Auction first-price bidding (HIGH)
First-price sealed bids on a public mempool = bid front-run. Use commit-reveal.

### Approve race (MEDIUM)
Classic ERC-20 `approve(spender, X)` → `approve(spender, Y)` front-run lets spender drain `X + Y`. See [[approval-issues]].

## Severity rubric

| Pattern | Severity |
|---|---|
| `amountOutMin = 0` on user-facing swap | **High** |
| Deadline = `block.timestamp` on user-facing swap | **High** |
| Block-data randomness for valuable outcomes | **High** |
| Commit-reveal missing on sealed bid | **High** |
| Permit + transferFrom unbundled | **Medium** |
| Bot-sweep risk on public NFT mint | **Medium** |
| JIT-LP exposure | **Low** |
| Display-only ordering issue | **Info** |

## Remediation patterns

- Slippage: surface as a user parameter, enforce a sane minimum.
- Deadline: surface as user parameter, never `block.timestamp`.
- Randomness: Chainlink VRF, RANDAO with epoch lookback, or commit-reveal.
- Bid auctions: commit-reveal (hash bid + nonce → reveal after close).
- For high-value flows: support private mempools (Flashbots Protect, MEV-Share, Berachain's BBS).
- Bundle permit + use in single tx.
- ERC-20 approval: prefer `permit` (EIP-2612) or `increaseAllowance`.

## False-positive notes

- Atomic protocol-internal swaps with no user-controlled output token aren't front-runnable.
- Sequenced L2s (Arbitrum One, Base) currently have no public mempool ordering attack — flag risk as L2-conditional.
- Deadline checks that come from a trusted off-chain oracle/router (e.g. CoW Protocol) can be skipped.

## Related

- [[oracle-manipulation]] — sandwich attacks are oracle moves
- [[approval-issues]]
- [[signature-replay]] — replayable signed messages are MEV gold
