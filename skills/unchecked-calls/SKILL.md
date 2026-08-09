---
name: unchecked-calls
description: Detect ignored external-call return values — silent failures from low-level call/delegatecall/staticcall, ignored ERC20 transfer return values, return-data length issues. Activate on `.call`, `.delegatecall`, `.staticcall`, `.send`, `transfer`/`transferFrom` (without SafeERC20), and any function returning `bool` whose return is discarded.
---

# Unchecked external calls detection

## When this applies

- Low-level `call`, `delegatecall`, `staticcall`, `send`
- ERC-20 `transfer` / `transferFrom` / `approve` (non-SafeERC20)
- Calls to user-provided addresses
- Multi-call patterns that don't propagate failures
- Try-catch swallowing all errors

## Detection patterns

### Ignored `.call` return (HIGH)
```solidity
(bool ok,) = target.call(data);   // ← ok unused
// or worse:
target.call(data);                 // ← Solidity ≥0.5 still allows this with warning
```
Always `require(ok, "call failed");` unless an intentional best-effort.

### ERC-20 without SafeERC20 (HIGH)
USDT and other non-conformant tokens don't return `bool`. Naive call:
```solidity
IERC20(usdt).transfer(to, amt);   // ← reverts on USDT due to ABI mismatch
```
Use OZ `SafeERC20`'s `safeTransfer` which handles missing return values.

### Return-data check missing (HIGH)
Even compliant ERC20 returning `false` instead of reverting is silently passed:
```solidity
bool ok = token.transfer(to, amt);   // ← ok unused, returns false on failure
```

### `try`/`catch` swallows everything (MEDIUM-HIGH)
```solidity
try external.call() { /* … */ }
catch { /* silently ignored */ }
```
Without inspecting `catch (bytes memory reason)`, you lose all info; transitioning a critical revert into a silent success is a bug.

### Address with no code (HIGH on `call`)
```solidity
(bool ok,) = target.call(data);
require(ok);
```
`ok = true` even if `target` is an EOA with no contract — `call` returns true. Add `target.code.length > 0` check.

### Permit followed by transferFrom — permit silently revertable (MEDIUM)
If `permit` reverts (because it was already used), the consuming transferFrom continues with a stale allowance. Use `try`/`catch` only to skip the permit reuse case.

### Multicall fail-skip (HIGH)
Some routers continue on per-call failure. If a treasury sweeps via multicall, a single failed call could drop revenue.

### `selfdestruct` / `transfer` no longer guaranteed on L2s with reduced gas
Forwarding 2300 gas is brittle on Berachain/Arbitrum/etc. — see [[dos-vectors]].

## Severity rubric

| Pattern | Severity |
|---|---|
| `.call` ignored, leads to silent fund loss | **Critical** |
| Non-SafeERC20 with USDT/non-conformant token | **High** |
| `target.call` without code-length check | **High** |
| Try-catch swallows revert without inspection | **High** |
| Multicall fail-skip on revenue path | **High** |
| `.transfer` (2300 gas) on L2 / to smart-wallet receivers | **Medium** |
| Best-effort fire-and-forget event hook | **Low** *(document intent)* |

## Remediation patterns

- Always check `(bool ok, bytes memory ret) = target.call(...)` and `require(ok, ...)`.
- For ERC-20: use OZ `SafeERC20` everywhere.
- After `.call` to dynamic addresses, check `target.code.length > 0` before relying on return.
- Replace `transfer` / `send` with `(bool ok,) = to.call{value: amt}("")` + check.
- For best-effort hooks (event-style), document with a comment and consider returning a status code rather than silently succeeding.

## False-positive notes

- A `.call` whose only side-effect-on-failure is a UX message can be best-effort — Info.
- Solady / Solmate sometimes use bare `call` with custom assembly checks — verify the surrounding bytes are inspected.

## Related

- [[token-compatibility]] — non-conformant ERC20s
- [[dos-vectors]]
- [[reentrancy]]
