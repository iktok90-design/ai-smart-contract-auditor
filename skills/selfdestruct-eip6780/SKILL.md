---
name: selfdestruct-eip6780
description: Detect selfdestruct misuse and EIP-6780 implications post-Cancun — bricked contracts, broken `assert(balance == X)` invariants, factory patterns relying on redeploy, deployment-tx-only selfdestruct corner cases. Activate on `selfdestruct`, `suicide`, `CREATE2` factories, contracts asserting on `address(this).balance`.
---

# selfdestruct / EIP-6780 detection

## EIP-6780 background

After Cancun (March 2024), `selfdestruct` no longer deletes the contract's code or storage *unless* called in the same transaction as the contract's deployment. It does still transfer all ether to the recipient. This changes the security model substantially:

- Pre-6780: any `selfdestruct` could brick a contract → many DoS attacks.
- Post-6780: `selfdestruct` outside the deploy-tx only forwards ether. Code/storage survives.

## When this applies

- Any `selfdestruct` call
- Contracts that assert `address(this).balance == X` (someone can force-add ether via `selfdestruct`)
- `CREATE2` factories relying on redeploy at same address (now broken — code persists)
- Diamonds / proxies with implementation-side selfdestruct
- Pre-Cancun deployed contracts (legacy semantics still apply at runtime)

## Detection patterns

### Forced-ether DoS on balance-equality assumption (HIGH — still relevant)
```solidity
require(address(this).balance == expected);   // ← attacker can `selfdestruct` ether to break this
```
Track expected balance in a state variable, not via `address(this).balance`.

### CREATE2 redeploy pattern broken (HIGH)
```solidity
// Pattern: deploy logic to deterministic addr, selfdestruct to "upgrade", redeploy.
// ← Post-6780, code persists. Redeploy at same address fails or reverts.
```
Migrate to true proxy patterns.

### selfdestruct in deploy-tx (still has full power) (HIGH)
A constructor that selfdestructs in the deploy tx truly deletes code+storage. Some "metamorphic" tricks abuse this.

### Library / facet with selfdestruct path reachable (HIGH)
Pre-6780-deployed diamond facets with selfdestruct paths remain dangerous. Even post-6780, a facet selfdestruct that orphans ether still costs.

### selfdestruct sending ether to known-revert recipient (LOW)
Selfdestruct still forwards ether — recipient cannot revert on receive (selfdestruct bypasses fallback). So this isn't a DoS for the destructor, but can leave the recipient with unexpected balance.

### Recovery via selfdestruct on stuck-fund contract (LOW-MEDIUM)
Sometimes a useful pattern — note intent.

## Severity rubric

| Pattern | Severity |
|---|---|
| `address(this).balance == X` invariant | **High** |
| Public `selfdestruct` path on deployed contract | **High** |
| CREATE2 redeploy/upgrade pattern (post-Cancun broken) | **High** |
| Diamond facet selfdestruct reachable | **High** |
| Constructor metamorphic selfdestruct | **High** *(may be intentional, document)* |
| `selfdestruct` to known revert-on-receive recipient | **Low** |
| `selfdestruct` as legitimate recovery, properly guarded | **Info** |

## Remediation patterns

- Don't use `address(this).balance` as part of any invariant. Track received ether explicitly.
- Migrate metamorphic / CREATE2-redeploy patterns to standard proxies (UUPS / Transparent).
- Remove `selfdestruct` from production contracts unless absolutely needed.
- If retained, guard heavily (multi-sig + timelock).

## False-positive notes

- A contract using `selfdestruct` only in a test-helper or migration script → not deployable, ignore.
- `selfdestruct` whose recipient is the contract's own address — does nothing useful, comment as code smell.

## Related

- [[delegatecall-risks]]
- [[dos-vectors]]
- [[access-control]]
