---
name: erc1271-contract-signatures
description: Detect ERC-1271 contract-signature bugs — magic-value handling, signature validation edge cases, smart-wallet interactions (Safe, Argent), replay-via-signature-update. Activate on `isValidSignature`, ERC1271 imports, smart-wallet integration, signed orders that may originate from contracts.
---

# ERC-1271 contract signatures detection

## Background

ERC-1271 lets contract accounts (smart wallets, multisigs) sign messages. Verification call:
```solidity
IERC1271(signer).isValidSignature(hash, sig) returns (bytes4 magicValue);
// magicValue must equal 0x1626ba7e
```

Without ERC-1271, smart-wallet users can't sign anything (no private key).

## When this applies

- Off-chain order signing (Seaport, Blur, X2Y2)
- Permit2 with smart-wallet senders
- EIP-712 verification paths
- Any `ecrecover(...) == signer` check that might accept contract signers

## Detection patterns

### Bypass via `ecrecover` for smart wallet (HIGH)
```solidity
require(ecrecover(hash, v, r, s) == signer, "bad sig");
// ← signer is a smart wallet, ecrecover returns address(0), check fails legitimately
```
The bug: contract owners can't sign at all. Add an ERC-1271 fallback:
```solidity
if (signer.code.length > 0) {
    require(IERC1271(signer).isValidSignature(hash, abi.encodePacked(r, s, v)) == 0x1626ba7e);
} else {
    require(ecrecover(hash, v, r, s) == signer);
}
```

### Wrong magic value check (HIGH)
```solidity
require(IERC1271(signer).isValidSignature(hash, sig) == 0x1626ba7c);   // ← typo: should be 0x1626ba7e
```

### Pre-EIP-1271 magic value (HIGH)
Some old impls return `0x20c13b0b` (the legacy bytes-based variant). Spec is hash-based `0x1626ba7e`. Mixing → reject valid sigs.

### Replay via signature-update on smart wallet (HIGH)
A Safe's `isValidSignature` checks owner approvals. If signature is approved via on-chain `approveHash` then consumed, can it be re-approved later? Replay risk.

### Smart wallet rotation breaks past sigs (LOW-MEDIUM)
If owner rotates, previously-validated signatures may now be valid by different signer logic. Depends on wallet impl.

### Returning data length issues (HIGH)
ERC-1271 returns `bytes4`. Naive callers using `staticcall` + manual returndata parsing can mis-decode.

### Gas griefing in isValidSignature (MEDIUM)
Smart wallet impl can spend unbounded gas in `isValidSignature` → relayer griefing.

### ERC-1271 + Permit2 (HIGH)
Permit2 must handle contract signers. Apps that wrap Permit2 must too.

## Severity rubric

| Pattern | Severity |
|---|---|
| App rejects smart-wallet users entirely (no 1271 fallback) | **High** *(usability — but also gives an exploitable bypass if mixed)* |
| Wrong magic value | **High** |
| Pre-EIP magic value not handled | **High** |
| Replay via approve-on-chain on Safe | **High** |
| Returning data length not validated | **High** |
| Unbounded gas in isValidSignature | **Medium** |

## Remediation patterns

- Use OZ `SignatureChecker.isValidSignatureNow(signer, hash, sig)` — handles both EOA and contract paths cleanly.
- Validate `magicValue == 0x1626ba7e` exactly.
- For Safe integration: use `SignMessageLib` and pre-approval flow.
- Bound gas: `(bool ok, bytes memory ret) = signer.staticcall{gas: 100_000}(...)`.

## False-positive notes

- Apps that explicitly don't support contract wallets (e.g. anti-Sybil) may intentionally reject. Confirm intent.

## Related

- [[signature-replay]]
- [[permit2-patterns]]
- [[aa-specialist]] (subagent)
