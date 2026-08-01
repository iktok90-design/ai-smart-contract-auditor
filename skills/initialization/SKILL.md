---
name: initialization
description: Detect initialization bugs in upgradeable contracts — missing `_disableInitializers()`, re-init attacks, parent-init not chained, constructor-vs-initializer confusion, public `initialize`. Activate on OZ Upgradeable, UUPS, Transparent proxy, Initializable, or any contract with `initialize` / `__init`.
---

# Initialization detection

## When this applies

- OZ `Initializable` / `*Upgradeable` contracts
- Custom upgradeable contracts with `initialize()` functions
- Beacon proxies, UUPS, Transparent — all flavors
- Factory-deployed clones (EIP-1167 minimal proxies)
- Any deploy script that uses `delegatecall` for setup

## Detection patterns

### Implementation contract not init-locked (CRITICAL)
```solidity
contract Vault is Initializable, OwnableUpgradeable {
    function initialize() external initializer {
        __Ownable_init(msg.sender);
    }
    // ← no constructor disabling initializers
}
```
Anyone can call `initialize` on the *implementation* address directly. Fix:
```solidity
/// @custom:oz-upgrades-unsafe-allow constructor
constructor() { _disableInitializers(); }
```

### Public initializer on deployed proxy (CRITICAL)
Proxy deployment script forgets to call `initialize` atomically → attacker calls it first → owns the contract.
Fix: deploy + initialize in same tx via factory or initializer-on-deploy proxy.

### Re-init via `reinitializer(N)` accessible to anyone (HIGH)
```solidity
function reinitialize() external reinitializer(2) {   // ← no auth
    __Pausable_init();
}
```
Add `onlyOwner` or `onlyProxyAdmin`.

### Parent init not called (HIGH)
```solidity
function initialize() external initializer {
    // __Pausable_init() missing — pausable state defaults to wrong values
}
```
Verify every parent's `__X_init()` is chained.

### Logic in constructor instead of initializer (HIGH for upgradeable)
```solidity
constructor() OwnableUpgradeable() { owner = msg.sender; }   // ← runs on impl, not proxy
```
Upgradeable contracts must do setup in `initialize`, not constructor.

### Constructor runs on proxy (incorrect mental model) (MEDIUM)
Devs sometimes write constructor logic expecting it to run on the proxy. It doesn't — constructor runs at deployment of the *implementation*, and the proxy never re-runs it.

### Clones (minimal proxies) without per-clone init guard (HIGH)
EIP-1167 clones share implementation; each clone's `_initialized` slot starts at 0. If `initialize` has no auth, anyone can initialize a fresh clone before the deployer.

### Re-init via storage-slot manipulation (HIGH)
OZ v4: `_initialized` is uint8; v5: `_initialized` is uint64. Custom upgradeable contracts that don't use OZ may have bypassable guards.

## Severity rubric

| Pattern | Severity |
|---|---|
| Implementation init not disabled (anyone owns impl) | **Critical** |
| Deployed proxy with public init un-called | **Critical** |
| Re-initializer with no auth | **High** |
| Clones with no atomic init | **High** |
| Parent `__init` missing → broken inheritance | **High** |
| Constructor used instead of initializer (upgradeable) | **High** |
| Initializer parameter validation missing (e.g. zero-address admin) | **Medium** |
| Initial state value seems wrong (defaults to 0) | **Medium** |

## Remediation patterns

- Implementation constructor: `_disableInitializers()`.
- Deploy proxy + call initializer atomically (single factory tx).
- Mark `initialize` as `initializer`, `reinitialize` as `reinitializer(N)` with auth.
- Chain every parent's `__X_init()` in order matching inheritance.
- For clones: use a factory that deploys-and-initializes in one call.
- Test: from a fresh deploy, attempt `initialize()` twice and from a non-admin EOA — both should revert.

## False-positive notes

- Non-upgradeable contracts that just happen to use `initialize` as a name — not the same pattern.
- `Initializable` used purely as a one-shot setup guard with no proxy involved — lower severity.

## Related

- [[storage-layout]]
- [[access-control]]
- [[delegatecall-risks]]
