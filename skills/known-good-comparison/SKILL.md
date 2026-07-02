---
name: known-good-comparison
description: When auditing a contract that resembles a canonical implementation (OpenZeppelin, Solady, Uniswap, Compound, etc.), compare against the reference. Treat deviations as suspect by default.
---

# Known-good comparison (meta-skill)

Most production Solidity is forks of well-known references. The fastest path to high-precision audit is to know what "normal" looks like and treat deviations as suspect.

## Reference catalog

The skill maintains awareness of canonical shapes:

### Tokens
- OpenZeppelin ERC20, ERC721, ERC1155 (versions 4.x and 5.x)
- Solady ERC20, ERC721, ERC1155, ERC4626
- ERC-2612 permit canonical
- Permit2 Uniswap canonical

### Access / governance
- OZ Ownable, Ownable2Step
- OZ AccessControl, AccessControlEnumerable, AccessControlDefaultAdminRules
- OZ Governor, GovernorVotes, GovernorTimelockControl
- Compound Governor Bravo
- OZ TimelockController

### Proxies / upgrades
- OZ ERC1967, UUPS, TransparentUpgradeable
- OZ BeaconProxy
- Diamond standard EIP-2535 reference
- Solady LibClone

### Math / utilities
- OZ Math.mulDiv
- Solady FixedPointMathLib
- PRBMath UD60x18, SD59x18

### AMMs / DEX
- Uniswap V2 Pair, Router, Factory
- Uniswap V3 Pool, NonfungiblePositionManager
- Uniswap V4 PoolManager + hook templates
- Curve StableSwap, CryptoSwap
- Balancer V2, V3 vaults

### Lending
- Aave V3 Pool, AToken, VariableDebtToken
- Compound V3 Comet
- Morpho Blue

### Vaults
- OZ ERC4626 (v4.9+ for inflation defense)
- Yearn V3 strategies
- MetaMorpho

## How to use

### Step 1 — Detect reference

If the contract:
- Imports from `@openzeppelin/contracts` or `solady/`
- Inherits from a recognizable parent
- Implements a recognizable interface (`IERC20`, `IPoolManager`, etc.)
- Has function signatures matching a reference

→ Identify the reference and version.

### Step 2 — Diff the deviations

For each function inherited or overridden from the reference:
- Has its body been modified?
- Has its access control been changed?
- Has its return value been altered?
- Has its modifier set been changed (e.g. `nonReentrant` removed)?

For each storage variable added beyond the reference:
- Is the storage layout still compatible with upgrade safety?

### Step 3 — Treat deviations as suspect

Each deviation gets a justification check:
- Was this change intentional and beneficial?
- Or was it a typo / mistake / regression?

Most exploits in forks live in the *deviation*, not the reference.

## Output integration

When finding-writing, include a reference comparison if applicable:

```
[REENT-001 | High] Reentrancy in Vault.withdraw

  Reference: OpenZeppelin v5.0.2 ERC4626.withdraw
  Deviation: caller-side nonReentrant guard removed (commit 0xabc)
  Impact:    classic reentrancy pattern reintroduced
  
  → Confidence: HIGH (deviation from known-good adds the bug)
```

## When NOT to use

- Pure novel implementations with no canonical parent.
- Contracts so heavily modified that the reference comparison is misleading.

## Related

- /diff-audit command — exposes this skill as a user-facing operation
- [[confidence-scoring]] — known-good match → confidence MEDIUM-to-HIGH
- [[multi-pass-self-critique]] — known-good is a third independent pass
