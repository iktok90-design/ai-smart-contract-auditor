---
name: token-compatibility
description: Detect ERC-20 token compatibility issues — fee-on-transfer, rebasing, non-standard return values, missing decimals(), low-decimal tokens, blacklistable tokens (USDC), pausable tokens. Activate on any ERC-20 integration, `transfer`/`transferFrom` use, balance-based accounting, decimal scaling.
---

# Token compatibility detection

## When this applies

- Any ERC-20 integration: lending, AMM, vault, staking, bridge
- Balance-based accounting (`balanceOf(this) - prevBalance`)
- Decimal scaling between tokens
- Cross-chain bridges with various token implementations
- Aggregators / routers handling user-supplied tokens

## Detection patterns

### Fee-on-transfer assumed away (HIGH)
```solidity
uint256 before = token.balanceOf(address(this));
token.transferFrom(user, address(this), amount);
shares = amount * X / Y;        // ← uses `amount`, not actual received
```
Tokens like USDT (when fee enabled), SafeMoon, etc. take a fee. Use `balanceOf(this) - before` as the effective amount.

### Rebasing token accounting (HIGH)
stETH, aUSDC, AMPL — balances change without `transfer`. Vaults assuming `balanceOf` ≡ deposit will mis-account. Either don't accept rebasing tokens, or use share-based accounting (wstETH-style wrappers).

### Non-standard return values — USDT (HIGH)
USDT's `transfer` does NOT return bool (pre-`SafeERC20` use breaks):
```solidity
bool ok = IERC20(usdt).transfer(to, amt);   // ← reverts: ABI mismatch
```
Use OZ `SafeERC20` which uses low-level call + return-data inspection.

### Blacklistable tokens (HIGH)
USDC, USDT can blacklist addresses. If a user gets blacklisted after deposit, the protocol may be unable to return funds → other users' funds stuck if pooled.

### Pausable tokens (HIGH)
USDC, USDT can pause transfers. Protocol functions that must succeed (liquidations) may revert.

### Low-decimal tokens (MEDIUM-HIGH)
GUSD has 2 decimals. Math assuming 18 decimals causes huge rounding errors.
```solidity
shares = assets * 1e18 / something;   // ← shares now astronomical or zero
```

### Tokens with hooks (ERC-777) (HIGH)
Reentrancy surface (see [[reentrancy]]). Many protocols implicitly assume vanilla ERC-20.

### Tokens with double-entry (HIGH)
TUSD historically had two valid addresses. `transferFrom` could be invoked from either. Approval to one didn't bind the other.

### Missing return on approve / non-zero approve revert (HIGH)
Some tokens (early USDT) require `approve(spender, 0)` before `approve(spender, X)`. Use `safeApprove` or `forceApprove`. See [[approval-issues]].

### Missing `decimals()` (LOW)
Non-standard tokens may lack `decimals()`. Guard with try/catch and default to 18.

### Tokens that revert on zero-amount transfer (LOW-MEDIUM)
LEND, others. Cap-by-zero guards needed.

## Severity rubric

| Pattern | Severity |
|---|---|
| Vault accepts fee-on-transfer with no balance-delta accounting | **High** |
| Protocol accepts rebasing token without share-wrapper | **High** |
| Naive ERC-20 transfer (no SafeERC20) | **High** |
| Pooled funds with blacklistable token + no escape hatch | **High** |
| Low-decimal token with 18-decimal-assumed math | **High** |
| Pausable token in liquidation path | **High** |
| Approve-non-zero revert ignored | **High** |
| Zero-amount-revert in batch flow | **Medium** |
| Missing `decimals()` graceful handling | **Low** |

## Remediation patterns

- **Allowlist tokens** — easier than supporting every token.
- **Use SafeERC20** — covers most return-value quirks.
- **Balance-delta accounting** — measure `balanceOf(this) - prev` after transferFrom.
- **Disallow rebasing tokens** — or only accept their share-wrapped form (wstETH not stETH).
- **Reset approval before set** — `forceApprove` from OZ ≥4.9, or `safeApprove(0)` then `safeApprove(amount)`.
- **Escape hatches** — admin can swap a single user's blacklisted balance out of pooled state into a side mapping.

## False-positive notes

- Protocol explicitly lists supported tokens and tests against them → not a finding for unsupported.
- Test/mock tokens in test/ → ignore.

## Related

- [[unchecked-calls]]
- [[approval-issues]]
- [[reentrancy]] — ERC-777 hooks
- [[integer-issues]] — decimals math
