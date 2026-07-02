---
name: diamond-eip2535
description: Detect Diamond (EIP-2535) bugs — facet selector collisions, init-vs-upgrade safety, storage-namespace collisions, facet selfdestruct paths, missing facet cuts. Activate on Diamond imports, DiamondCut, IDiamondLoupe, IDiamondCut, LibDiamond, facet patterns.
---

# Diamond (EIP-2535) detection

## When this applies

- Any contract using EIP-2535 Diamond Standard
- Custom multi-facet upgradeable systems
- Frameworks: Nick Mudge's diamond-1, Diamond Industries' SoliState, custom diamond impls

## Detection patterns

### Function-selector collision (CRITICAL)
Two facets implementing the same 4-byte selector (e.g. `function foo()` and `function bar(uint256)` that hash to the same selector). Diamond routes to the last-cut facet, but during a cut, the *old* version may be reachable.
- Required: precompute selector mapping at deploy + verify uniqueness; rerun at every diamond-cut.

### Storage namespace collision (CRITICAL)
Two facets using the same `bytes32 STORAGE_POSITION` slot prefix.
```solidity
library LibA { bytes32 constant POS = keccak256("auditsentry.a"); }
library LibB { bytes32 constant POS = keccak256("auditsentry.a"); }   // ← collision
```
Use unique namespace strings per facet.

### Init-vs-upgrade confusion (HIGH)
Diamond init runs once via `delegatecall` to an Init contract. Re-running init after diamond-cut → can re-initialize values or run dangerous code. See [[initialization]].

### `diamondCut` access control (CRITICAL)
```solidity
function diamondCut(FacetCut[] calldata cuts, address init, bytes calldata data) external {
    // ← no owner check
}
```
Anyone can add/remove/replace facets.

### Removing facet without removing selectors (HIGH)
Facet contract removed from blockchain (selfdestructed pre-6780, or simply deauthorized), but selectors still point to the old address → reverts.

### Replacing critical infrastructure facet (CRITICAL)
A malicious facet replacement can hijack the entire diamond. Centralization risk depends on `diamondCut` authority.

### Facet selfdestruct pre-EIP-6780 (HIGH)
Pre-Cancun: a facet calling `selfdestruct` deletes itself, breaking the diamond.
Post-Cancun (EIP-6780): only delete-in-deploy-tx. Existing facets still risky if deployed before. See [[selfdestruct-eip6780]].

### Missing `IDiamondLoupe` (MEDIUM)
Without Loupe, off-chain consumers can't introspect facets. Soft requirement.

### Function visibility per facet (MEDIUM)
Internal functions in a facet aren't callable through the diamond (only externals are routed). Devs sometimes mistake the contracts.

### Init function reentrancy (HIGH)
`init` delegate-call during diamond-cut can reenter. Lock during cut.

### Multi-facet shared storage (HIGH)
If multiple facets share a storage struct, modifying struct fields requires coordinated upgrades. Refactoring one facet's view of the struct breaks others.

## Severity rubric

| Pattern | Severity |
|---|---|
| `diamondCut` lacks owner check | **Critical** |
| Selector collision (or missed verification) | **Critical** |
| Storage namespace collision | **Critical** |
| Init function callable post-deploy | **High** |
| Removing facet leaves dangling selectors | **High** |
| Facet selfdestruct path (pre-6780 deploy) | **High** |
| Missing Loupe | **Medium** |
| Internal function mis-exposed | **Medium** |

## Remediation patterns

- Use proven framework (Nick Mudge's diamond-1 or LDC) — don't roll your own.
- Maintain off-chain selector registry; gate `diamondCut` with a Timelock and a CI check that runs `diamondCut --dry-run`.
- Storage: per-facet namespaced via `keccak256("<unique-app-name>.<facet-name>")`.
- Init: callable only via `LibDiamond.diamondCut`, never directly.
- Loupe: always implement for introspection.
- Document the storage struct shared by facets in a separate file.

## False-positive notes

- Reading-only Loupe call isn't a finding.
- A diamond with a single facet is fine; the complexity surfaces at >2 facets.

## Related

- [[storage-layout]]
- [[delegatecall-risks]]
- [[selfdestruct-eip6780]]
- [[centralization-risk]]
