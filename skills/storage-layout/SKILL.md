---
name: storage-layout
description: Detect storage-layout issues in upgradeable contracts — slot collisions, slot reuse, packing changes, missing gap. Activate when reviewing UUPS/Transparent proxies, OZ Upgradeable contracts, diamonds (EIP-2535), libraries with structs, or any contract using assembly to read storage slots.
---

# Storage layout detection

## When this applies

- UUPS / Transparent proxy upgrades
- OpenZeppelin `*Upgradeable` contracts
- EIP-2535 Diamonds with shared storage
- Libraries that read storage via assembly
- Any change that modifies inheritance order or struct layout in an upgradeable contract
- Initializers that depend on storage being zero

## Detection patterns

### Missing __gap (HIGH)
```solidity
contract BaseUpgradeable {
    uint256 public foo;
    // no uint256[50] __gap;   ← can't append fields to derived contracts safely
}
```
OZ convention: each base contract reserves `__gap` for future fields.

### Slot collision between proxy and implementation (CRITICAL)
Implementation defines `address public owner` in slot 0; proxy uses slot 0 for its admin. Hello, hijacked proxy.
Use EIP-1967 slots (`bytes32(uint256(keccak256("eip1967.proxy.implementation")) - 1)`).

### Inheritance reorder breaks layout (HIGH)
```solidity
// V1: contract X is A, B, C
// V2: contract X is A, C, B   ← B's vars now at C's old slots
```
Even one append to a parent breaks all descendants.

### Struct field reorder/insert (HIGH)
Solidity packs adjacent same-bit-width fields. Inserting a `bool` between two `uint256` adds a slot. Verify with `forge inspect <Contract> storage`.

### Type widening (HIGH)
`uint8` → `uint256` changes packing.

### Library uses fixed assembly slot (MEDIUM-HIGH)
```solidity
assembly { sstore(0x0, value) }   // ← collides with the consumer's slot 0
```
Use namespaced storage (`keccak256("myapp.storage.foo")`).

### Diamond storage namespace collision (HIGH)
Two facets using the same `bytes32 STORAGE_POSITION`. Always derive from a unique namespace string.

### ERC-7201 namespaced storage missing on new code (MEDIUM)
Modern best-practice: use `@custom:storage-location erc7201:my.namespace`.

## Severity rubric

| Pattern | Severity |
|---|---|
| Proxy/impl slot 0 collision | **Critical** |
| Slot reuse after upgrade (data corruption) | **Critical** |
| Struct reorder in upgrade | **High** |
| Inheritance reorder | **High** |
| Missing `__gap` in upgradeable base | **High** |
| Diamond storage collision | **High** |
| Library writing to fixed low slots | **High** |
| ERC-7201 missing on new namespaced module | **Medium** |
| Variable rename only (same slot) | **Info** |

## Remediation patterns

- Run `forge inspect <Contract> storageLayout` for V1 and V2; diff JSON. Any non-append change = abort.
- OpenZeppelin Upgrades Plugin: `validateUpgrade()` catches most layout breaks at build time.
- Each upgradeable base contract reserves `uint256[N] private __gap` at the end (size by convention).
- Use EIP-1967 / EIP-7201 for namespaced storage in libraries and diamonds.
- Never modify or remove existing storage slots — only append.

## False-positive notes

- Adding a *constant* or `immutable` variable doesn't change storage layout (lives in bytecode, not storage).
- Pure function additions don't affect layout.
- Internal helper changes within a function don't affect layout.

## Related

- [[initialization]] — re-init after upgrade
- [[delegatecall-risks]] — proxy mechanics
- [[upgrade-safety]] (command/skill bridge)
