---
name: cross-contract-state
description: Detect cross-contract state inconsistency — two or more contracts sharing a token, oracle, or price feed where one mutates and another reads stale, cached state that drifts from source of truth, non-atomic multi-contract updates, accounting that assumes synchronized state, and reads during callbacks. Activate whenever a system spans multiple contracts that must agree on a value but update at different times.
---

# Cross-contract state consistency detection

## When this applies

Trigger on any of:

- A value (price, total supply, share rate, debt) lives in contract A but is read by B
- Cached/mirrored state (`cachedRate`, `lastTotalAssets`) that must be refreshed
- Multi-contract operations that mutate several contracts non-atomically
- Modules/plugins/hooks that read core state mid-update (read-during-callback)
- Proxy + implementation, or vault + strategy, or controller + market splits
- Accounting assuming "A and B are always in sync"

## Detection patterns

### Stale read of another contract's mid-update state (HIGH)
```solidity
// Vault.deposit() transfers to Strategy, then:
uint256 tvl = strategy.totalAssets();   // ← strategy hasn't accounted the deposit yet
shares = amount * totalSupply / tvl;    // wrong denominator
```
**Signal:** B reads A while A's update is incomplete (or vice versa). Share/price math uses a denominator that's about to change, letting an attacker mint mispriced shares. This is the read-only-reentrancy family generalized to ordinary call ordering.

### Cached value drift (HIGH)
```solidity
uint256 public cachedPrice;            // updated by poke()
function valueOf(uint256 amt) external view returns (uint256) {
    return amt * cachedPrice / 1e18;   // ← may be hours stale
}
```
**Signal:** a mirrored value with no freshness guarantee or no atomic refresh-before-use. Trades/loans price off a cache that diverged from the source contract.

### Non-atomic multi-contract update (HIGH)
```solidity
registry.setActive(id, true);
// external call here can observe registry=active but vault=uninitialized
vault.initialize(id);
```
**Signal:** state spread across contracts is updated in sequence; a reentrant or interleaved call observes a half-applied transaction (one contract updated, the other not). Invariants that span both contracts are temporarily violated.

### Shared dependency divergence (MEDIUM / HIGH)
Two contracts both read the same oracle/token but at different blocks or via different cached copies, then reconcile assuming equality. **Signal:** `assert(A.totalSupply() == B.mirroredSupply())`-style assumptions with independent update paths.

### Read-during-callback (HIGH)
A hook/plugin invoked mid-operation calls back and reads the core contract's not-yet-finalized accounting — the Curve/Balancer read-only reentrancy shape, but also plain composability (e.g. an ERC-4626 vault read by a money-market during the vault's own deposit).

## Severity rubric

| Pattern | Severity | Notes |
|---|---|---|
| Stale cross-contract read in share/price math | **High** | Mispriced mint/redeem |
| Read-during-callback of unfinalized state | **High** | Read-only reentrancy class |
| Non-atomic multi-contract invariant break | **High** | Half-applied state observable |
| Cached value drift used for valuation | **High** | Stale pricing |
| Synchronized-state assumption across modules | **Medium** | Reconciliation error |

## Remediation patterns

1. **Single source of truth** — derive values from one authoritative contract at read time; avoid mirrored copies, or make the mirror push-updated atomically in the same tx.
2. **Update-then-read ordering** — ensure A finalizes accounting before B reads; apply CEI across the call boundary, not just within a function.
3. **Atomic multi-contract updates** — batch via a single entrypoint / multicall that completes all writes before any external observation; guard with a system-wide reentrancy lock.
4. **Freshness gates on caches** — `require(block.timestamp - lastUpdate <= maxAge)` or refresh-on-read.
5. **Reentrancy-guard the read path too** (Balancer `ensureNotInVaultContext` / Curve lock) when callbacks can observe state.

## False-positive notes

- A mirror that is push-updated atomically in the same transaction as its source is consistent — don't flag.
- Independent contracts that never reconcile or compare state aren't subject to this; the risk needs a shared invariant.
- Eventually-consistent designs that explicitly tolerate drift (and bound it) are by-design — note the assumption.

## Related

- [[reentrancy]] — read-only reentrancy is the callback variant of this
- [[oracle-redundancy]] — shared feed staleness/divergence
- [[storage-layout]] — proxy/implementation storage must also stay consistent
