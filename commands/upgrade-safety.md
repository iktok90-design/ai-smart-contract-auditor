---
description: Check storage compatibility, initializer changes, and admin-function deltas between two implementations of an upgradeable contract.
argument-hint: "<old-impl-path-or-address> <new-impl-path-or-address>"
allowed-tools: Read, Bash, Agent, Skill, mcp__block-explorer__*, mcp__forge-runner__*
---

# /upgrade-safety — verify an upgrade is safe

For UUPS / Transparent / Beacon / Diamond upgrades. Catches the bugs that brick proxies.

## Procedure

### Step 1 — Resolve both impls

Inputs can be:
- Local source paths
- Deployed addresses (pulled via `block-explorer`)
- Foundry build artifacts (`out/Contract.sol/Contract.json`)

### Step 2 — Compare storage layouts

```
mcp__forge-runner__inspect_storage(path=<old>)
mcp__forge-runner__inspect_storage(path=<new>)
```

Diff the storage layouts. The rules ([[storage-layout]]):

- **Append-only is safe.** New fields at the end of the layout are fine.
- **Insert is unsafe.** Inserting a field mid-layout shifts all subsequent slots.
- **Type widening is unsafe** (uint8 → uint256 changes packing).
- **Reorder is unsafe.** Even renames of the *type* (not the field name) break packing.
- **Reorder of inheritance is unsafe.**
- **`__gap` consumption is okay** if the new field fits in the gap and the gap is reduced equivalently.

### Step 3 — Compare initializers

- `initialize` signature changed? → new impl needs `reinitializer(N)` semantic, not `initializer`.
- New parents added? → their `__init` must be chained in `reinitialize`.
- Removed initializers? → unset state risk.

### Step 4 — Compare admin surface

- Did any modifier change on a privileged function? (e.g. `onlyOwner` → `onlyRole(X)` without role having been granted)
- Did any new privileged function appear?
- Did any function gain `payable`?
- Did any function lose `nonReentrant`?

### Step 5 — Run upgrade safety checks

If OZ upgrades plugin available, also run its built-in `validateUpgrade()`.

### Step 6 — Output

```
Upgrade safety: src/VaultV1.sol → src/VaultV2.sol

  Storage layout:    ✓ safe (append-only)
  New slots:         +1 (uint256 emergencyFeeBps at slot 12)
  Initializer:       ⚠ requires reinitializer(2) — NOT YET MARKED
  Admin surface:     ⚠ `setEmergencyFee` added — no onlyOwner modifier
  __gap consumption: 0 / 50

  Verdict: UNSAFE — fix the two warnings before upgrading.

Recommended diff:
  ...
```

## Notes

- Always run before queuing a `upgradeTo` proposal.
- For diamonds, run per-facet upgrade safety + facet-selector-collision check.
- Saves real money — bricked upgrades have cost protocols millions.
