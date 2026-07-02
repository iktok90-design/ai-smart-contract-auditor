---
name: approval-issues
description: Detect ERC-20 approval pitfalls — approve race (front-run), missing safeApprove, infinite approvals, approval-without-revoke, Permit2 misuse, max-approval to untrusted contracts. Activate on `approve`, `safeApprove`, `permit`, `forceApprove`, `Permit2`, `IERC20.allowance`.
---

# Approval issues detection

## When this applies

- Any `approve` / `safeApprove` / `forceApprove` site
- `permit` (EIP-2612, DAI-style, Permit2)
- Routers / aggregators that hold persistent approvals
- Vaults that approve strategies to pull funds
- Bridges / cross-chain approvers

## Detection patterns

### The classic ERC-20 approve race (HIGH)
```solidity
token.approve(spender, X);   // later
token.approve(spender, Y);   // ← spender can front-run and drain X+Y
```
Use `forceApprove(spender, Y)` (OZ ≥4.9), or `decreaseAllowance` / `increaseAllowance`, or zero-first.

### `approve` instead of `safeApprove` on non-standard tokens (HIGH)
USDT requires approve-to-zero before approve-to-X. Use OZ `forceApprove`.

### Infinite approval to mutable contract (HIGH)
```solidity
token.approve(router, type(uint256).max);   // ← router is upgradeable, future impl can drain
```
Mitigate with allowance-per-action.

### Per-pull infinite approval (HIGH)
Vault → strategy infinite approval; if strategy is upgradeable or has a bug, vault funds drainable.

### Permit2 sig stolen / replayed (HIGH)
Permit2 signatures are bearer instruments — anyone with the sig can transfer. If the signed payload is logged or leaked, funds are drainable until the nonce is invalidated. Add a deadline.

### `permit` then ignore failure (MEDIUM)
```solidity
try IERC20Permit(token).permit(owner, spender, ...) {} catch {}
token.transferFrom(owner, ...);   // ← if permit fails, uses any stale allowance
```
Caller can grief by front-running permit. Acceptable IFF you then check the allowance is sufficient.

### Approval to address(0) on revoke (LOW)
Some tokens treat `approve(0, x)` as a no-op or revert. Use the documented revoke method.

### Allowance still set after action completes (HIGH for routers)
```solidity
token.safeApprove(target, amount);
target.swap(...);
// ← allowance lingers; if `amount` was max, target keeps power
```
Set to 0 after each action, or use a single-tx wrapper.

### Approve to factory / clone-deployer (HIGH)
Deployer can deploy attacker-controlled implementation that consumes the approval.

## Severity rubric

| Pattern | Severity |
|---|---|
| Persistent infinite approval to upgradeable router | **High** |
| Approve race ignored, no `forceApprove` / `increaseAllowance` | **High** |
| USDT-style approve without zero-reset | **High** |
| Vault → strategy infinite allowance with mutable strategy | **High** |
| Permit2 with no deadline | **High** |
| Permit failure swallowed, allowance not re-checked | **Medium** |
| Lingering allowance after one-shot router action | **High** |

## Remediation patterns

- Always use OZ `forceApprove` for setting; `safeIncreaseAllowance` for top-ups.
- After a router/exec call: `safeApprove(target, 0)` to reset.
- For vault→strategy: pull-only allowances and per-cycle resets.
- Permit2: short deadlines (minutes), per-payload nonce, bind to specific recipient + amount.
- For EOA users: surface the actual amount in the UI; never auto-approve max from the contract.

## False-positive notes

- Internal-only approve where source and spender are both controlled → Info.
- WETH9-style `approve` returning bool always-true is well-known and safe.

## Related

- [[token-compatibility]]
- [[signature-replay]] — Permit2 / EIP-2612
- [[mev-frontrunning]] — approve race is an MEV pattern
