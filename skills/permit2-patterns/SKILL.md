---
name: permit2-patterns
description: Detect Permit2 / EIP-2612 lifecycle bugs — signature lifecycle, allowance transfer vs signature transfer confusion, nonce reuse, deadline manipulation, witness-data misuse. Activate on `permit`, `permitTransferFrom`, `IPermit2`, `SignatureTransfer`, `AllowanceTransfer`, `PermitWitnessTransferFrom`, `PermitBatchTransferFrom`.
---

# Permit2 / EIP-2612 detection

## Background

EIP-2612 (`permit`) — token-native gasless approval, per-token nonce.
Permit2 (Uniswap) — canonical contract bridging legacy ERC20s into the permit world; two APIs:
- **SignatureTransfer** — one-shot, sig consumed atomically.
- **AllowanceTransfer** — persistent allowance with nonce + expiration.

## When this applies

- Routers, swap aggregators, vaults using Permit2 / EIP-2612 for gasless approve flows
- Custom permit implementations
- Apps calling `IPermit2.permitTransferFrom`, `permitWitnessTransferFrom`, `permit`

## Detection patterns

### Permit2 `permitTransferFrom` without amount check (CRITICAL)
```solidity
permit2.permitTransferFrom(permit, transferDetails, owner, signature);
// uses `transferDetails.requestedAmount` — caller-controlled
```
Caller can request `permit.permitted.amount` (the max), regardless of intent. App must enforce the actual transfer amount.

### Witness data ignored (HIGH)
`permitWitnessTransferFrom` includes a user-signed `witness` blob. App must validate it matches the intended action; otherwise sig can be reused with different context.

### SignatureTransfer vs AllowanceTransfer confusion (HIGH)
SignatureTransfer is one-shot. AllowanceTransfer is persistent with nonce + expiration. Mixing → over-approval or replay.

### Allowance not invalidated after one-shot use (HIGH)
Some implementations using AllowanceTransfer don't increment nonce after consumption.

### Missing deadline (HIGH)
Permit sigs without deadline are bearer instruments forever.

### EIP-2612 permit failure swallowed (MEDIUM)
```solidity
try IERC20Permit(token).permit(...) {} catch {}
token.transferFrom(...);   // ← if permit fails, falls back to stale allowance
```
Acceptable IFF the app then validates allowance is sufficient.

### Permit + transferFrom unbundled (MEDIUM — MEV)
Submitting `permit` in one tx then `transferFrom` in another lets a searcher front-run the permit and grief.

### Hardcoded chainId / DOMAIN_SEPARATOR cached (HIGH)
Some EIP-2612 impls cache DOMAIN_SEPARATOR in constructor. Post-chain-fork, this is wrong. Re-derive based on `block.chainid`. See [[signature-replay]].

### DAI-style permit (HIGH)
DAI uses a non-standard permit signature (allowed-bool, no amount). Apps that hit DAI with standard EIP-2612 ABI will revert.

### USDC EIP-3009 (different from EIP-2612) (MEDIUM)
USDC uses `transferWithAuthorization` / `receiveWithAuthorization` instead of permit on most chains. Apps assuming permit-on-USDC break.

### Nonce reuse across signers (HIGH)
Custom permit impls that use a global nonce instead of per-signer nonce → cross-signer collision.

### Bitmap nonce model assumed but not used (HIGH)
Permit2 uses a bitmap for nonces (word index + bit). Custom forks sometimes simplify this and break.

## Severity rubric

| Pattern | Severity |
|---|---|
| `permitTransferFrom` with caller-controlled requestedAmount | **Critical** |
| AllowanceTransfer not invalidating nonce on one-shot use | **High** |
| Sig without deadline | **High** |
| Cached DOMAIN_SEPARATOR not fork-aware | **High** |
| Witness ignored in permitWitnessTransferFrom | **High** |
| Failed permit swallowed, allowance not re-checked | **Medium** |
| Permit + tx unbundled (MEV grief) | **Medium** |
| DAI/USDC-specific sig variant mishandled | **High** |
| Global nonce instead of per-signer | **High** |

## Remediation patterns

- App-side: validate `transferDetails.requestedAmount <= permit.permitted.amount` AND matches intent.
- Bundle `permit` + consuming op in one tx.
- Use Permit2's canonical contracts via OZ / Uniswap reference impls.
- For DAI / USDC: dispatch on token type, use appropriate sig variant.
- For chain forks: re-derive `DOMAIN_SEPARATOR` when chainId changes.

## False-positive notes

- Apps that just call `IERC20Permit.permit(...)` directly and don't trust the result are typically fine.
- Uniswap V4 / Universal Router use Permit2 canonically — audit how they pass requestedAmount.

## Related

- [[signature-replay]]
- [[approval-issues]]
- [[mev-frontrunning]]
