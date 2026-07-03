---
description: Symbolic execution via Halmos. For paths that fuzzing cannot reach.
argument-hint: "<contract-or-function>"
allowed-tools: Read, Write, Bash, Agent, mcp__fuzz-runner__*
---

# /symbolic — symbolic execution

Wraps [Halmos](https://github.com/a16z/halmos) — symbolic execution of Foundry tests. Use when fuzzing has plateaued and you need to prove a property. Run it through `mcp__fuzz-runner__halmos` (offline-safe labeled sample if Halmos isn't installed).

## Prerequisites

- Halmos installed: `pip install halmos`
- Test functions named `check_*` (Halmos convention).

## Procedure

### Step 1 — Translate fuzz tests to symbolic

Existing fuzz tests with `bound()` and concrete state can be promoted to Halmos by:
- Renaming `testFuzz_*` → `check_*`
- Replacing `bound()` with symbolic-friendly ranges (Halmos handles `vm.assume` better)
- Removing concrete setup where symbolic exec can synthesize state

### Step 2 — Generate Halmos checks

For each invariant from `/invariant`, write a `check_*` variant:

```solidity
function check_ConvertToAssets_NeverExceedsTotalAssets(uint256 shares) public {
    vm.assume(shares > 0 && shares <= vault.totalSupply());
    uint256 assets = vault.convertToAssets(shares);
    assert(assets <= vault.totalAssets());
}
```

### Step 3 — Run

```bash
halmos --function check_ConvertToAssets_NeverExceedsTotalAssets
```

Halmos either:
- ✓ Proves the property holds across all reachable inputs.
- ✗ Provides a concrete counter-example (input + state) that breaks it.

### Step 4 — Output

```
Symbolic verification:
  check_ConvertToAssets_NeverExceedsTotalAssets     ✓ proved
  check_PreviewDeposit_Monotonic                     ✓ proved
  check_VirtualSharesPositive                        ✗ counter-example

  Counter-example for check_VirtualSharesPositive:
    state:    totalSupply = 0, totalAssets = 1e30
    input:    deposit(1)
    expected: shares > 0
    actual:   shares = 0  (rounded to zero by virtual-share dilution)
```

## Notes

- Symbolic exec is slow but exhaustive within its bounds.
- Not all Solidity code is tractable for Halmos — heavy assembly, complex loops, unbounded state may time out.
- Use as a complement to invariant tests, not a replacement.
