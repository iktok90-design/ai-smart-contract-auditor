---
name: signature-replay
description: Detect signature-replay, EIP-712 / EIP-2612 mistakes, malleable signatures, cross-chain replay, missing nonces. Activate on `ecrecover`, `permit`, meta-transactions, signed orders, signed approvals, EIP-712 domain construction, gasless transaction relayers.
---

# Signature replay & EIP-712 detection

## When this applies

- `ecrecover` and any signature verification path
- `permit` (EIP-2612, ERC-4494) implementations
- Meta-tx / gasless flows (ERC-2771, EIP-3074 / EIP-7702 wrapping)
- Signed off-chain orders (0x, Seaport, custom)
- Signed governance votes
- Validator-set / bridge signature aggregation (see [[bridge-specialist]])

## Detection patterns

### Missing nonce (CRITICAL)
```solidity
bytes32 digest = keccak256(abi.encode(sender, amount));   // ← no nonce, infinitely replayable
require(ecrecover(digest, v, r, s) == sender);
```

### Missing chainId in domain (CRITICAL — cross-chain replay)
EIP-712 domain MUST include `chainId`. Without it, signing on Ethereum replays on Optimism/Arbitrum/etc.
```solidity
bytes32 domain = keccak256(abi.encode(EIP712_DOMAIN, name, version, /* no chainId */ , verifyingContract));
```

### Hardcoded chainId / `_DOMAIN_SEPARATOR` cached without fork-detect (HIGH)
```solidity
DOMAIN_SEPARATOR = _hashDomain(block.chainid);   // ← cached in constructor, breaks after fork
```
Re-compute when `block.chainid` differs.

### Signature malleability (HIGH)
ECDSA accepts both `(r, s)` and `(r, n-s)` for valid signatures. If you use the digest as a uniqueness key, attacker can flip s and replay. Enforce `s ≤ secp256k1n/2` and `v ∈ {27, 28}`. Or use OpenZeppelin's `ECDSA.tryRecover` which already does this.

### `ecrecover` returns address(0) on invalid sig — not reverted (HIGH)
```solidity
address signer = ecrecover(digest, v, r, s);   // returns 0 on bad sig
require(roles[signer]);   // ← if roles[address(0)] is ever true (default mapping behavior), it bypasses
```
Always `require(signer != address(0))` after ecrecover, or use OZ ECDSA.

### Replay across contracts (HIGH)
Missing `address(this)` / `verifyingContract` in the signed payload. Same admin sig usable on multiple deployments.

### Front-running of permit (MEDIUM)
See [[mev-frontrunning]] §permit.

### Approval-front-run via signed message (HIGH)
Off-chain signed orders where the maker can replay across fills if the order doesn't include `salt` + `nonce` + cancellation mechanism.

### Permit2 confusion (HIGH)
Mixing Permit2's `SignatureTransfer` (one-shot) vs `AllowanceTransfer` (persistent). Read the contract's docs carefully.

## Severity rubric

| Pattern | Severity |
|---|---|
| Missing nonce in signed payload | **Critical** |
| Missing chainId — cross-chain replay possible | **Critical** |
| `ecrecover` without `signer != address(0)` check | **High** |
| Malleable signature accepted (no s-bound check) | **High** |
| Cached DOMAIN_SEPARATOR without fork-aware re-compute | **High** |
| Signed payload omits `verifyingContract` | **High** |
| Order salt missing, no cancellation mechanism | **High** |
| Off-by-one chainId for L2 chains (e.g. Polygon = 137 not 1) | **High** |
| Permit gas-grief on revert reverts in batch | **Medium** |

## Remediation patterns

- Use OZ `EIP712` base + `ECDSA.recover` — handles s-bound, malleability, zero-address.
- Include in every signed payload: `chainId`, `verifyingContract`, `nonce`, `deadline`, plus any operation-specific fields.
- Re-derive `DOMAIN_SEPARATOR` lazily when `block.chainid != cached_chainid`.
- Nonces: per-signer monotonic OR per-order salt + on-chain seen-bitmap.
- For ERC-1271 (contract signers), validate via `isValidSignature(bytes32, bytes)` returning the magic value.

## False-positive notes

- Single-use bound to a specific consumed-event flag isn't strictly replayable — but still flag if the bound is fragile.
- Pure off-chain signatures never submitted on-chain don't have replay risk on chain, but watch for accidental reuse.

## Related

- [[access-control]]
- [[bridge-specialist]] — validator set signatures
- [[mev-frontrunning]]
