---
name: v4-hook-delta-accounting
description: Detect Uniswap V4 hooks that fail to settle currency deltas with the PoolManager. Every credit/debit a hook creates (BeforeSwapDelta, afterSwap hookDelta, take/mint, donate, settle/sync) is tracked in the manager's transient nonzeroDeltaCount; if the books aren't flat when unlock returns, the whole transaction reverts (CurrencyNotSettled), and mismatched take/settle/donate either strands hook funds in the manager or lets a swap leave with unpaid debt. Activate on hooks returning deltas, calling take/settle/mint/burn/donate, or custom unlockCallback accounting.
---

# Uniswap V4 hook delta-accounting detection

## When this applies

Trigger on any of:

- Callbacks returning `BeforeSwapDelta` or a non-zero `int128` `hookDelta` from `afterSwap`/`afterAddLiquidity`/`afterRemoveLiquidity`
- Calls to `poolManager.take`, `settle`, `sync`, `mint`, `burn`, `donate`, `clear`
- Custom `unlockCallback` that moves currency in/out of the manager
- Hooks that charge custom fees, skim, or rebate by adjusting deltas
- `currencyDelta` reads, or accounting that must net to zero before `unlock` returns
- Donations to a pool, or take/settle pairs that should balance

## Detection patterns

### Hook takes currency but never settles (HIGH)
```solidity
function afterSwap(address, PoolKey calldata key, ..., BalanceDelta, bytes calldata)
    external override returns (bytes4, int128)
{
    poolManager.take(key.currency0, address(this), feeAmount);  // ← creates a -debt for the hook
    return (this.afterSwap.selector, 0);                         // ← returns 0 delta, never settles
}
```
`take` debits the hook's currency balance in the manager; with no matching `settle`/returned delta, `nonzeroDeltaCount != 0` and the entire `unlock` reverts `CurrencyNotSettled` — every swap on the pool reverts.
**Signal:** `take`/`mint` without a balancing `settle`/`burn` or a non-zero returned `hookDelta` accounting for it.

### Returned delta not backed by a real transfer (HIGH)
```solidity
return (this.afterSwap.selector, int128(feeAmount));   // claims to owe the pool feeAmount...
// ...but the hook never `sync` + `settle`s those tokens into the manager
```
A positive `hookDelta` says "the hook owes the pool X"; if the hook never actually transfers and settles X, the books don't flatten → revert, or in the inverse direction the swapper leaves with unpaid debt.
**Signal:** non-zero returned delta with no corresponding `sync`/`settle` (or `take`) of the same currency/amount.

### Donate / take imbalance (HIGH)
```solidity
poolManager.donate(key, amount0, amount1, "");  // adds to pool reserves...
// hook forgot to settle the donated tokens it owes
```
`donate` increases what the hook owes the pool; the tokens must be `settle`d. Imbalanced donate strands funds or reverts.
**Signal:** `donate` without settling the donated amounts, or `take` of donated funds with no offsetting credit.

### BeforeSwapDelta sign/units error (HIGH)
```solidity
BeforeSwapDelta d = toBeforeSwapDelta(int128(amtSpecified), 0);  // wrong: specified vs unspecified swapped
```
`BeforeSwapDelta` packs (specified, unspecified) deltas; swapping the two halves or the sign mis-accounts the swap and either reverts or hands the swapper free output.
**Signal:** `toBeforeSwapDelta` arguments in the wrong slot/sign, or specified-delta not reconciled with the actual swap amount.

## Severity rubric

| Pattern | Severity | Notes |
|---|---|---|
| take/mint with no matching settle → CurrencyNotSettled | **High** | Pool-wide swap DoS |
| Returned hookDelta not backed by settle → revert or free funds | **High** | Loss or DoS |
| Donate without settling owed tokens | **High** | Stranded funds / revert |
| BeforeSwapDelta sign/slot error | **High** | Mis-accounted swap, value leak |
| Hook over-settles (pays more than owed) | **Medium** | Hook self-loss, no swapper gain |
| Deltas always net to zero within callback | **Info** | Correct accounting |

## Remediation patterns

1. **Net every delta to zero before unlock returns** — for each currency the hook touches, pair `take` with `settle` (or a correct returned `hookDelta`).
2. **sync → transfer → settle** — call `poolManager.sync(currency)`, transfer the tokens in, then `settle()` so the manager credits the exact owed amount.
3. **Use the official delta helpers** — `toBeforeSwapDelta(specified, unspecified)` with correct argument order and signs; reconcile `specified` against `params.amountSpecified`.
4. **Assert flatness in tests** — after a swap, assert `poolManager.currencyDelta(hook, currency) == 0` for every currency.
5. **Settle donations** — every `donate` must be followed by transferring + settling the donated amounts.

## False-positive notes

- A hook returning `BeforeSwapDeltaLibrary.ZERO_DELTA` / `0` hookDelta and never calling take/settle/donate has nothing to settle — Info.
- Settlement done inside a shared internal helper called at the end of the callback may look unbalanced locally — trace the full callback before flagging.
- Over-settling (hook pays extra) is a hook self-loss, not a protocol-loss — Medium, not High.

## Related

- [[v4-hook-permission-flags-mismatch]] — returnDelta flags must be set for deltas to apply
- [[v4-hook-reentrancy-via-unlock]] — settlement ordering vs. reentrancy
- [[unchecked-calls]]
