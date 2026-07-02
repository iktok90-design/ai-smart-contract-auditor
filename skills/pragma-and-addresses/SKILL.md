---
name: pragma-and-addresses
description: Detect floating pragma, hardcoded addresses, missing zero-address checks, deprecated Solidity versions. Activate on every `pragma solidity` line, `constant ADDRESS = 0x...`, `immutable` address parameters, address comparisons.
---

# Pragma & address-hygiene detection

## When this applies

- Top of every Solidity file
- Constants and immutables typed `address`
- Constructor / initializer parameters typed `address`
- `mapping(address => …)` updates
- Any cross-chain deployment where addresses differ per chain

## Detection patterns

### Floating pragma (LOW-MEDIUM)
```solidity
pragma solidity ^0.8.0;   // ← floats to any 0.8.x
```
Production deployments should pin: `pragma solidity 0.8.24;`. Floating pragma means audited bytecode ≠ deployed bytecode.

### Outdated Solidity version (MEDIUM)
`<0.8.0` lacks built-in overflow checks. `<0.8.20` lacks PUSH0 opcode handling for some L2s. Audit pin date vs known compiler bugs.

### Hardcoded address tied to a single chain (HIGH)
```solidity
address constant WETH = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;   // ← mainnet WETH, breaks on Base/Arbitrum
```
WETH/USDC/USDT all have *different* addresses per chain. Use a chain-configurable resolver.

### Missing zero-address check (HIGH on key fields)
```solidity
function setOwner(address newOwner) external onlyOwner {
    owner = newOwner;   // ← if 0x0, contract is bricked
}
```
Affects ownership, oracles, treasury, fee receiver, token addresses.

### Address(0) as default sentinel (MEDIUM)
Using `address(0)` to mean "unset" works but is brittle — collides with default mapping values.

### `payable(0)` as burn (LOW-MEDIUM)
Burning by sending to `address(0)`'s payable is legal but locks ether forever. Document intent.

### `address(this)` in cross-chain context (HIGH for CREATE2 deployments)
`address(this)` differs unless deterministically deployed at same address across chains.

### `address public foo;` instead of `address public immutable foo;` (LOW)
Mutable when it shouldn't be — gas cost + risk of accidental setter.

### Chain-ID-dependent address resolution missing (HIGH)
```solidity
if (block.chainid == 1) router = MAINNET_ROUTER;
else if (block.chainid == 42161) router = ARB_ROUTER;
else revert("unsupported chain");   // ← without this, unsupported chain silently uses mainnet address
```

## Severity rubric

| Pattern | Severity |
|---|---|
| Hardcoded mainnet address in multi-chain deployment | **High** |
| Missing zero-address check on owner/admin set | **High** |
| Chain-ID-based resolver missing for cross-chain | **High** |
| Outdated Solidity version with known CVE | **High** |
| Floating pragma (`^0.8.0`) in production | **Medium** |
| Mutable address that should be immutable | **Low** |
| Outdated but CVE-free Solidity version | **Low** |
| Comment-only address documentation outdated | **Info** |

## Remediation patterns

- Pin exact Solidity version: `pragma solidity 0.8.24;` (or whatever you tested with).
- Zero-address checks on every setter: `require(newAddr != address(0), "zero address");`.
- Chain-aware address resolver:
  ```solidity
  function _weth() internal view returns (address) {
      if (block.chainid == 1) return MAINNET_WETH;
      if (block.chainid == 8453) return BASE_WETH;
      if (block.chainid == 42161) return ARB_WETH;
      revert UnsupportedChain();
  }
  ```
- Use OZ `Ownable2Step` so even a bad zero-address would require accept().
- For immutable-when-possible, mark with `immutable` keyword.

## False-positive notes

- Test/mock files with hardcoded addresses are fine.
- `address(0)` checks may be redundant if subsequent OZ library calls already validate.
- Floating pragma in libraries (vs deployed contracts) is sometimes intentional.

## Related

- [[access-control]]
- [[storage-layout]]
- [[upgrade-safety]]
