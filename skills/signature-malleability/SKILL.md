---
name: signature-malleability
description: Detect ECDSA signature malleability and ecrecover pitfalls — missing low-s (EIP-2) enforcement, unconstrained v, unchecked address(0) from ecrecover, replay across chainId/contract from a missing EIP-712 domain separator, EIP-2098 compact-signature confusion, and signature reuse. Activate whenever code calls ecrecover directly, parses (r,s,v) from bytes, or verifies signed messages without OpenZeppelin ECDSA.
---

# Signature malleability detection

## When this applies

Trigger on any of:

- Direct `ecrecover(hash, v, r, s)` calls (not via OpenZeppelin `ECDSA.recover`)
- Manual `(r, s, v)` decoding from a `bytes` signature with assembly
- Permit / meta-tx / order-book / claim flows that verify a signed digest
- Signatures used as nonces or dedup keys (e.g. `usedSig[sig] = true`)
- EIP-712 typed-data verification, or its absence where one is needed

## Detection patterns

### Missing low-s enforcement / malleable sig (HIGH if sig is a key)
```solidity
address signer = ecrecover(hash, v, r, s);   // no s-range check
require(signer == expected);
usedSignature[keccak256(abi.encode(r,s,v))] = true;  // ← dedup keyed on sig bytes
```
**Signal:** for any valid `(r,s,v)` the "flipped" signature `(r, n - s, v ^ 1)` recovers the *same* signer (the classic Bitcoin/Ethereum transaction-malleability class). If the signature itself is the replay key, an attacker submits the twin and bypasses dedup. Enforce `s <= secp256k1n/2` (EIP-2).

### Unchecked ecrecover returning address(0) (HIGH)
```solidity
address signer = ecrecover(hash, v, r, s);
require(signer == owner);  // if owner could ever be address(0)... or no check at all
```
**Signal:** malformed inputs make `ecrecover` return `address(0)`. Any code path where the compared-against value can be `address(0)` (uninitialized mapping slot, default) authenticates an attacker with garbage. Always `require(signer != address(0))`.

### Unconstrained v (MEDIUM)
Accepting arbitrary `v` (not 27/28) or trusting a caller-supplied `v` for EIP-2098 compact sigs, mixing the 64-byte and 65-byte formats. EIP-2098 packs `yParity` into the high bit of `s`; decoding it as a raw 65-byte sig corrupts recovery.

### Cross-domain / cross-chain replay (HIGH)
```solidity
bytes32 digest = keccak256(abi.encode(ORDER_TYPEHASH, maker, amount, nonce));
```
**Signal:** no EIP-712 domain separator binding `chainId` and `verifyingContract`. A signature is replayable on another chain (post-fork) or a sibling deployment. Build the digest with `_hashTypedDataV4` (`\x19\x01` + domainSeparator + structHash) and recompute the domain separator if `block.chainid` changes.

### Signature reuse / no nonce (HIGH)
Same digest accepted twice because there's no per-signer nonce or no marking of consumed digests — meta-tx and claim flows drain repeatedly.

## Severity rubric

| Pattern | Severity | Notes |
|---|---|---|
| Malleable sig used as replay/dedup key | **High** | Twin sig bypasses guard |
| ecrecover==address(0) authenticates attacker | **High** | Auth bypass |
| Missing EIP-712 domain → cross-chain replay | **High** | Signature reuse across deployments |
| No nonce → straight replay | **High** | Repeated execution |
| Unconstrained v / EIP-2098 confusion | **Medium** | Format-dependent |
| Low-s missing but sig never used as a key | **Low** | Defense-in-depth |

## Remediation patterns

1. **Use OpenZeppelin `ECDSA.recover`** — it enforces `s <= secp256k1n/2`, rejects bad `v`, and reverts on `address(0)` (it also handles EIP-2098).
2. **Bind digests with EIP-712** (`EIP712` base + `_hashTypedDataV4`), including `chainId` and `verifyingContract`; recompute the domain separator on chainid change.
3. **Use per-signer nonces** (incrementing) rather than signature-bytes dedup; consume by `(signer, nonce)` not `(r,s,v)`.
4. **Explicit `require(signer != address(0))`** even when using libraries, for any hand-rolled path.
5. Prefer **`SignatureChecker`** when signers may be ERC-1271 contract wallets.

## False-positive notes

- Code already routing through OpenZeppelin `ECDSA`/`SignatureChecker` with EIP-712 and nonces is safe — don't re-flag the underlying `ecrecover`.
- A sig verified against a *non-zero, always-set* signer where the digest is never reused is malleability-tolerant; note, don't escalate.

## Related

- [[signature-replay]] — nonce/chainId replay is the sibling concern
- [[erc1271-contract-signatures]] — smart-wallet signers need `isValidSignature`
- [[permit2-patterns]] — Permit2 / EIP-2612 digests and nonces
