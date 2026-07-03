---
name: solady-ownable-init-frontrun
description: Detect front-runnable ownership initialization in Solady Ownable / OwnableRoles. Solady's `_initializeOwner` is a guarded one-time setter (it reverts with `AlreadyInitialized` on a second call) but it is NOT access-controlled, so in constructor-less deployment paths (minimal-proxy clones, EIP-1167, factory `create`/`create2` without atomic init) an attacker can call the public initializer first and seize ownership. Activate on solady Ownable/OwnableRoles in clones, factories, or any non-atomic deploy+init.
---

# Solady Ownable initializer front-run detection

## When this applies

Trigger on any of:

- `import {Ownable} from "solady/auth/Ownable.sol";` or `OwnableRoles`
- A contract calling `_initializeOwner(...)` from a public/external `initialize()` rather than the constructor
- Minimal-proxy clones (`LibClone.clone` / EIP-1167) of an Ownable implementation
- Factory deployments where `create`/`create2` and `initialize()` are two separate transactions
- Implementation contracts behind proxies (UUPS / transparent) using Solady Ownable
- Any `initialize`/`init` that is not protected by an initializer guard or atomic deploy

## Detection patterns

### Public init, non-atomic deploy (HIGH)
```solidity
contract Vault is Ownable {
    function initialize(address owner) external {
        _initializeOwner(owner);   // reverts on 2nd call — but ANYONE can make the 1st
    }
}
// Factory:
address v = LibClone.clone(impl);
Vault(v).initialize(msg.sender);   // ← separate tx: front-runnable in the mempool
```
Between `clone` and `initialize`, a searcher front-runs `initialize(attacker)`. `_initializeOwner` succeeds for them; the legit call then reverts `AlreadyInitialized`.
**Signal:** `_initializeOwner` reachable from an unguarded external function and deploy/init are not in one transaction.

### Implementation left uninitialized (HIGH)
```solidity
contract Impl is Ownable {
    function initialize(address o) external { _initializeOwner(o); }
}
// Impl deployed standalone, never initialized → anyone claims it.
```
For UUPS, an attacker who owns the *implementation* can call `upgradeTo`/`selfdestruct`-style logic and brick or hijack all proxies pointing at it.
**Signal:** Solady Ownable implementation deployed but not initialized in the same tx, and the implementation itself is callable.

### Re-init via `_setOwner` exposure (MEDIUM-HIGH)
```solidity
function _setOwner(address o) internal { ... }   // Solady internal
function rescueOwner(address o) external { _setOwner(o); }  // ← bypasses init guard entirely
```
`_setOwner` has no `AlreadyInitialized` guard; exposing it publicly defeats the one-time protection.
**Signal:** `_setOwner` wrapped in an unprotected external function.

## Severity rubric

| Pattern | Severity | Notes |
|---|---|---|
| Clone/factory with non-atomic public initialize | **High** | Ownership theft, mempool front-run |
| Uninitialized implementation behind proxy | **High** | Impl hijack → proxy compromise |
| `_setOwner` exposed externally | **High** | Init guard bypassed entirely |
| Init gated to factory `msg.sender` / atomic deploy | **Info** | Correctly protected |

## Remediation patterns

1. **Atomic deploy+init** — initialize inside the same transaction as `clone`/`create`, or use `LibClone.cloneDeterministic` + immediate init in the factory call.
2. **Restrict the initializer** — `require(msg.sender == factory)` or pass owner via clone immutable args (`LibClone.clone(impl, immutableArgs)`).
3. **Lock the implementation** — call `_initializeOwner(deadAddress)` / `_disableInitializers`-equivalent in the implementation's constructor so the standalone impl can't be claimed.
4. **Never expose `_setOwner`** — only `transferOwnership` (owner-gated) and the guarded `_initializeOwner`.

## False-positive notes

- Constructor-based `_initializeOwner` (non-clone deploy) is not front-runnable — Info.
- Factory that deploys and initializes in one call (atomic) — not exploitable.
- Initializer gated on `msg.sender == factory` or consuming clone immutable args — safe.

## Related

- [[access-control]]
- [[delegatecall-risks]] — UUPS implementation hijack
- [[centralization-risk]]
