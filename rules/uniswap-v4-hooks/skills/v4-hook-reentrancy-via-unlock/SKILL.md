---
name: v4-hook-reentrancy-via-unlock
description: Detect reentrancy in Uniswap V4 hooks via the PoolManager unlock/lock callback. V4 uses a singleton PoolManager with transient lock state; all pool mutations happen inside an unlockCallback. A hook that makes external calls during beforeSwap/afterSwap/before*Liquidity (to tokens with hooks, arbitrary routers, or user-controlled contracts) can be re-entered, and because the manager is already unlocked the attacker can recursively swap/modify liquidity against stale hook state. Activate on any V4 hook performing external calls inside a callback, or custom unlockCallback logic.
---

# Uniswap V4 hook reentrancy via unlock detection

## When this applies

Trigger on any of:

- Hook callbacks (`beforeSwap`, `afterSwap`, `beforeAddLiquidity`, `afterRemoveLiquidity`, `beforeDonate`, ...) that perform external calls
- External calls to ERC-777 / ERC-1155 / callback-bearing tokens, arbitrary routers, or user-supplied addresses inside a callback
- A hook that itself calls `poolManager.unlock(...)` or `swap`/`modifyLiquidity`/`take`/`settle` re-entrantly
- Custom `unlockCallback` implementations
- Hook state (fee accumulators, TWAP buffers, custom accounting) read/written across an external call within one callback
- `safeTransfer` / `transferFrom` of tokens that invoke recipient hooks during settlement

## Detection patterns

### External call before state finalize inside a callback (HIGH)
```solidity
function afterSwap(address, PoolKey calldata key, ..., int128) external override returns (bytes4, int128) {
    uint256 reward = _pending[key.toId()];
    rewardToken.safeTransfer(msg.sender, reward);  // ← ERC-777 hook re-enters here
    _pending[key.toId()] = 0;                       // ← cleared AFTER the external call
    return (this.afterSwap.selector, 0);
}
```
During the transfer the recipient re-enters `swap` (manager is unlocked), triggering `afterSwap` again while `_pending` is still non-zero → double reward.
**Signal:** hook state mutated after an external call inside a callback, with the PoolManager unlocked (CEI violated in hook context).

### Recursive unlock / nested swap (HIGH)
```solidity
function beforeSwap(...) external override returns (bytes4, BeforeSwapDelta, uint24) {
    router.call(userData);   // user contract calls poolManager.swap again, re-entrant
    ...
}
```
The transient lock is already held; the manager permits nested operations, so the hook's pre-swap invariants can be violated mid-flight.
**Signal:** arbitrary/user-controlled external call inside a callback whose result feeds the same swap's accounting.

### Read-only reentrancy on hook-exposed price (HIGH)
```solidity
function getTwap(PoolKey calldata key) external view returns (uint256) {
    return _twap[key.toId()];   // read by a victim mid-callback, before this hook updates it
}
```
A consumer reads the hook's oracle while the hook is mid-callback and its accumulator is stale.
**Signal:** a public view exposing hook state that is updated inside a callback, readable during reentrancy. See [[reentrancy]].

## Severity rubric

| Pattern | Severity | Notes |
|---|---|---|
| State cleared after external call in callback → double-spend | **High** | Direct value extraction |
| User-controlled call inside callback enabling nested swap | **High** | Invariant break mid-swap |
| Read-only reentrancy on hook oracle/TWAP | **High** | Often missed, see [[oracle-manipulation]] |
| External call to a fixed, trusted contract only | **Medium** | Bounded by trust assumption |
| Callback with no external calls / pure accounting | **Info** | No reentrancy surface |

## Remediation patterns

1. **CEI inside the hook** — finalize hook state (zero out pending, update accumulators) before any external call within a callback.
2. **Per-hook reentrancy guard** — a transient (`tstore`) guard on callbacks; the PoolManager's own lock does NOT protect hook-internal state.
3. **Avoid callback-bearing tokens** in callbacks, or pull/settle through the manager (`take`/`settle`) rather than raw transfers to arbitrary recipients.
4. **Guard view functions** that expose hook state used as a price, or serve a "settled" snapshot that only updates outside callbacks.
5. **No arbitrary external calls** inside callbacks; restrict to allowlisted, non-reentrant targets.

## False-positive notes

- A callback that performs no external calls and only mutates its own storage has no reentrancy path — Info.
- Calls strictly to the PoolManager's `take`/`settle`/`sync` (no recipient hooks) don't re-enter the hook.
- A callback already wrapped in a transient reentrancy guard with state finalized first — downgrade.

## Related

- [[reentrancy]]
- [[v4-hook-delta-accounting]] — settlement ordering interacts with reentrancy
- [[oracle-manipulation]] — read-only reentrancy on hook TWAP
- [[token-compatibility]] — ERC-777 hooks widen the surface
