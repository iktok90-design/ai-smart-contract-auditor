---
name: intents-erc7683
description: Detect ERC-7683 / intent-based protocol bugs — solver griefing, intent expiration, settlement race conditions, surplus theft, cross-chain replay, allowance front-runs. Activate on `IOriginSettler`, `IDestinationSettler`, `CrossChainOrder`, ERC-7683 imports, UniswapX reactor patterns, CoW settlement, 1inch Fusion, Across spoke pool / hub pool.
---

# Intent-based / ERC-7683 detection

## When this applies

- ERC-7683 cross-chain intents
- UniswapX (reactor + filler model)
- CoW Protocol (batch auctions)
- 1inch Fusion / Fusion+
- Across (origin lock + destination fill)
- Any "user signs intent, solver fills" pattern

## Detection patterns

### Surplus theft (HIGH)
Intent specifies `amountOutMin` (user's floor). Solver delivers exactly the min, pockets actual market surplus. UX issue but real for intents with tight min — solver fills inferior route.
Defense: surplus distribution to user (CoW does this).

### Cross-chain replay (HIGH)
ERC-7683 intent payload signable for one (origin, destination) pair must include both chainIds. Otherwise replay on another destination.

### Solver front-run (HIGH)
Solver A's fill is in mempool; Solver B copies and submits with higher gas → A's tx reverts. Mitigations: private mempools, MEV-Share, exclusivity windows.

### Intent expiration not enforced atomically (HIGH)
`require(block.timestamp <= deadline)` at settlement. If deadline is checked at the wrong step (e.g. at origin lock but not destination fill), funds can be stuck.

### Origin lock + destination fill atomicity (CRITICAL)
- User locks funds on origin chain.
- Solver fills on destination chain.
- Solver claims locked funds on origin (via cross-chain proof).
- If destination fill fails after origin lock: refund mechanism required.
- If origin lock fails after destination fill: solver loses; bond required.

### Reactor callback reentrancy (HIGH — UniswapX-specific)
`reactor.execute(order, fillerCallback)` → callback in attacker-controlled filler contract. If reactor state is mutated mid-callback, reentrancy possible. Required: `nonReentrant` on the reactor.

### Permit2 + intent collision (HIGH)
Intent assumes user's Permit2 sig was just executed. Solver can race: front-run the permit, grief the intent.

### Allowed-fillers list bypass (HIGH)
Intent restricts to specific solvers. If the list check is via `tx.origin` (instead of `msg.sender` or signature recovery), trivially bypassable.

### Decay function correctness (HIGH — UniswapX)
Dutch auction: output token amount decays over time. If decay math overflows or rounds wrong, solver fills at the *minimum* before decay completes.

### Salt-based nonce missing (HIGH)
Intent identifies itself by `(user, salt)`. If salt isn't enforced unique on-chain, multiple identical intents replayable.

### Solver bond on cross-chain (HIGH)
Cross-chain intents (ERC-7683): solver bonds on destination to prove they'll bring liquidity. If bond is too small, solver can grief by filling and abandoning.

### Slow-path fallback (HIGH)
If fast solver doesn't fill: fallback to a slower, trustless path. Bug surface: race between fast and slow paths.

### Cancellation race (HIGH)
User cancels intent (`cancel`); solver fills in the same block. Order-of-execution determines who wins. Required: cancel must invalidate fills in the same tx.

## Severity rubric

| Pattern | Severity |
|---|---|
| Origin lock without atomic destination fill / refund | **Critical** |
| Cross-chain replay (no chainId binding) | **Critical** |
| Reactor callback reentrancy | **High** |
| Solver-allowed-list using tx.origin | **High** |
| Surplus theft (silent) | **High** |
| Decay function precision wrong | **High** |
| Salt nonce not enforced unique | **High** |
| Insufficient solver bond | **High** |
| Cancellation race | **High** |
| Deadline not enforced atomically | **High** |
| Permit2 race | **Medium** |

## Remediation patterns

- Always include both origin and destination chainIds in signed payload.
- Atomic origin lock + cross-chain message + destination fill OR atomic refund.
- `nonReentrant` on reactor.
- Solver-allowed-list via signature recovery against an allowlist set, not tx.origin.
- Surplus → user (CoW model).
- Bond sized to disincentivize griefing (≥ profit margin × N).
- Cancellation invalidates all in-flight fills atomically.

## False-positive notes

- CoW / UniswapX reference implementations are well-audited.
- Solver-side bugs aren't in scope for the *contract* audit — call out as advisory.

## Related

- [[intents-specialist]] (subagent)
- [[cross-chain-messaging]]
- [[mev-frontrunning]]
- [[permit2-patterns]]
