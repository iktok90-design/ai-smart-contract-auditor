---
name: solady-erc20-permit2-assumptions
description: Detect unsafe assumptions about Solady's gas-optimized ERC20/ERC2612 permit and DN404 metadata. Solady's ERC20 uses custom storage slots, returns bools via assembly, exposes a virtual `_constantNameHash`/`_versionHash` for permit domain separation, and its DN404 mirror splits ERC20/ERC721 logic — integrators that assume OZ-style behavior, revert strings, or that `name()`/`decimals()` are always present can misbehave. Activate on solady/tokens imports, ERC2612 permit flows, DN404, or off-chain code parsing Solady revert reasons.
---

# Solady ERC20 / permit / DN404 assumption detection

## When this applies

Trigger on any of:

- `import {ERC20} from "solady/tokens/ERC20.sol";` or `ERC2612`, `DN404`, `DN404Mirror`, `ERC4626` from solady
- Integrations calling `permit(...)` and assuming a fixed EIP-712 domain / version string
- Code relying on Solady's revert *reasons* (Solady reverts with custom errors / 4-byte selectors, not strings)
- DN404 tokens treated as plain ERC20 (the NFT mirror has separate transfer semantics)
- Off-chain indexers decoding events / revert data assuming OZ layout
- Overriding `name()`, `symbol()`, `_constantNameHash`, `_versionHash`, or `_domainNameAndVersion`

## Detection patterns

### Hardcoded permit domain separator (MEDIUM)
```solidity
bytes32 DOMAIN = keccak256(abi.encode(
    TYPE_HASH, keccak256("MyToken"), keccak256("1"), block.chainid, token
));
// ← assumes version "1"; Solady ERC2612 default version is "1" but DN404/overrides may differ
```
Solady derives the domain via `_domainNameAndVersion()` (default version `"1"`). If the token overrides `_versionHash` or `name()`, a hand-rolled separator mismatches and every `permit` reverts `InvalidPermit`.
**Signal:** off-chain or on-chain code reconstructs the EIP-712 domain instead of reading `DOMAIN_SEPARATOR()` from the token.

### Relying on revert strings (MEDIUM)
```solidity
try token.transferFrom(a, b, amt) returns (bool) {}
catch Error(string memory reason) {           // ← Solady reverts with custom errors,
    if (keccak256(bytes(reason)) == ...) {}    //    NOT Error(string); this branch never hits
}
```
Solady reverts `InsufficientBalance()` / `InsufficientAllowance()` (4-byte). `catch Error(string)` won't match; only `catch (bytes memory)` / `catch` will.
**Signal:** `catch Error(string)` or string comparison used to branch on a Solady token failure.

### DN404 treated as vanilla ERC20 (MEDIUM)
```solidity
dn404Token.transfer(to, amt);   // also mints/burns NFTs in the mirror; gas + reentrancy surface
```
DN404 fractionalizes an NFT collection; an ERC20 transfer can mint/burn mirror NFTs and invoke `onERC721Received`-style hooks. Treating it as inert ERC20 ignores added gas and a callback surface.
**Signal:** DN404 token integrated through a path that assumes ERC20 transfers have no side effects / no callbacks.

### Assuming metadata always present (LOW-MEDIUM)
```solidity
uint8 d = IERC20(token).decimals();   // Solady ERC20 leaves name/symbol/decimals virtual
```
Solady's base ERC20 leaves `name()`/`symbol()` as `virtual` returning empty unless overridden; a minimal token may omit them.
**Signal:** unguarded `decimals()`/`name()` read on a Solady-derived token.

## Severity rubric

| Pattern | Severity | Notes |
|---|---|---|
| Hand-rolled permit domain mismatching token → permits brick | **Medium** | Liveness, not loss; per-token |
| Revert-string branching never executes | **Medium** | Silent wrong control flow |
| DN404 used as plain ERC20 (callback / gas surprise) | **Medium** | Reentrancy/gas surface, see [[reentrancy]] |
| Unguarded metadata read | **Low** | Reverts or returns empty |

## Remediation patterns

1. **Read `DOMAIN_SEPARATOR()`** off the token instead of reconstructing it; never hardcode the version string.
2. **Catch `bytes`, not `Error(string)`** — match Solady custom-error selectors or use a generic `catch`.
3. **Detect DN404** (e.g. via `DN404Mirror` linkage / interface) and route it through NFT-aware logic; budget gas and treat transfers as callback-bearing.
4. **Guard metadata** with try/catch defaulting decimals to 18.

## False-positive notes

- Reading `DOMAIN_SEPARATOR()` directly (not reconstructing it) is correct — no finding.
- A non-DN404 Solady ERC20 with metadata overridden is a normal token — only flag missing overrides.
- Generic `catch {}` already handles custom errors — downgrade.

## Related

- [[signature-malleability]] — permit signature handling
- [[token-compatibility]] — non-standard return / metadata
- [[reentrancy]] — DN404 mirror callbacks
