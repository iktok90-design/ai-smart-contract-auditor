---
name: v4-hook-permission-flags-mismatch
description: Detect Uniswap V4 hooks whose address-encoded permission flags don't match the callbacks the hook actually implements. In V4 the hook's permissions live in the low bits of its deployed address (mined via CREATE2 salt) and must agree with getHookPermissions(); a callback the hook implements but whose flag bit is unset is never invoked, and a flag set without a real implementation makes pool initialization revert in Hooks.validateHookPermissions. Activate on any BaseHook/IHooks contract, getHookPermissions overrides, or hook address mining.
---

# Uniswap V4 hook permission-flag mismatch detection

## When this applies

Trigger on any of:

- Contracts inheriting `BaseHook` / implementing `IHooks`
- An overridden `getHookPermissions()` returning a `Hooks.Permissions` struct
- Implemented callbacks: `beforeSwap`, `afterSwap`, `beforeAddLiquidity`, `afterAddLiquidity`, `beforeRemoveLiquidity`, `afterRemoveLiquidity`, `beforeInitialize`, `afterInitialize`, `beforeDonate`, `afterDonate`
- `*ReturnDelta` permission flags (`afterSwapReturnDelta`, `beforeSwapReturnDelta`, etc.)
- CREATE2 / `HookMiner.find` salt mining to encode flags into the hook address
- Pool initialization that passes the hook address to `PoolManager.initialize`

## Detection patterns

### Implemented callback whose flag bit is unset (HIGH)
```solidity
function getHookPermissions() public pure override returns (Hooks.Permissions memory) {
    return Hooks.Permissions({ beforeSwap: true, afterSwap: false, /* ...all else false */ });
}
function afterSwap(...) external override returns (bytes4, int128) {
    _accrueFees(...);          // ← real logic, but afterSwap flag is FALSE
    return (this.afterSwap.selector, 0);
}
```
The pool reads permissions from the hook *address bits*, not from the function table. With the `AFTER_SWAP` bit unset, the PoolManager never calls `afterSwap`; `_accrueFees` silently never runs.
**Signal:** a callback is implemented (non-reverting body) but its corresponding permission is `false` / the address bit is unmined.

### Flag set without implementation → init reverts (HIGH)
```solidity
return Hooks.Permissions({ beforeAddLiquidity: true, /* ... */ });
// but beforeAddLiquidity is NOT overridden → BaseHook reverts HookNotImplemented
```
`Hooks.validateHookPermissions` checks that each set address bit corresponds to an implemented callback; a set flag with no override makes `PoolManager.initialize` revert, bricking the pool.
**Signal:** permission `true` (or address bit set) with no matching overridden function, or the default `BaseHook` stub left in place (reverts `HookNotImplemented`).

### returnDelta flag mismatch (HIGH)
```solidity
beforeSwapReturnDelta: false   // but beforeSwap returns a non-zero BeforeSwapDelta
```
If `beforeSwap` returns a non-zero delta while `BEFORE_SWAP_RETURNS_DELTA` is unset, the manager ignores the delta (or reverts), stranding the accounting the hook tried to apply.
**Signal:** a callback returns a non-zero `BeforeSwapDelta`/`int128` while its `*ReturnDelta` permission is false.

### Address bits ≠ getHookPermissions (HIGH)
```solidity
address hook = address(uint160(0x...0040));  // only BEFORE_SWAP bit
// getHookPermissions() also claims afterSwap → mismatch at validateHookPermissions
```
**Signal:** the mined deployment address low bits don't equal the `getHookPermissions()` struct.

## Severity rubric

| Pattern | Severity | Notes |
|---|---|---|
| Implemented callback with unset flag → silently skipped | **High** | Fees/limits/guards never run |
| Flag set, no implementation → init reverts | **High** | Pool un-initializable (DoS) |
| returnDelta flag mismatch → delta ignored | **High** | Stranded accounting, see [[v4-hook-delta-accounting]] |
| Address bits disagree with getHookPermissions | **High** | Deterministic init revert |
| Cosmetic flag set but callback is a true no-op | **Low** | Wasted gas only |

## Remediation patterns

1. **Single source of truth** — derive the deploy salt from `getHookPermissions()` (e.g. `HookMiner.find` with the exact flag set) so address bits and the struct can't drift.
2. **Assert at construction** — `Hooks.validateHookPermissions(this, getHookPermissions())` in the constructor to fail fast on a wrong address.
3. **Implement exactly the flagged callbacks** — every `true` has an override; every override has a `true`. Remove dead callbacks or set their flag.
4. **Set the matching `*ReturnDelta` flag** whenever a callback can return a non-zero delta.
5. **Test against the real PoolManager** init path, not a mock that skips validation.

## False-positive notes

- A callback present only to satisfy an interface but truly returning zero/no-op with its flag intentionally unset is fine — Info, confirm no side effects.
- Hooks deployed via the official `HookMiner` with asserted permissions are consistent by construction.

## Related

- [[v4-hook-delta-accounting]] — returnDelta flags pair with settlement
- [[access-control]]
- [[initialization]]
