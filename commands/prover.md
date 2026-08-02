---
description: Formal verification entrypoint — prove a property holds for all inputs with Halmos (symbolic, offline) or Certora (CVL) using ready-made property templates.
argument-hint: "[contract] [property]"
allowed-tools: Read, Write, Bash, Skill, mcp__forge-runner__*, mcp__fuzz-runner__*
---

# /prover — prove it, don't just fuzz it

Fuzzing samples inputs; formal verification proves a property over *all* inputs (or returns a concrete counter-example). This command defaults to **Halmos** — symbolic execution that runs offline against your existing Foundry tests — and falls back to **Certora** (CVL spec) when configured.

## Procedure

### Step 1 — Pick the property

`$ARGUMENTS` is `[contract] [property]`. If no property is named, propose from the templates by protocol type below. Each maps to a `check_` test function.

**ERC-20 — supply conservation / no inflation**
```solidity
function check_transfer_preservesSupply(address to, uint256 amt) public {
    uint256 pre = token.totalSupply();
    token.transfer(to, amt);
    assert(token.totalSupply() == pre);   // no mint/burn on transfer
}
```

**AMM — constant-product K monotonicity**
- `reserve0 * reserve1` after a fee-paying swap is `>=` before. [[flash-loan-attacks]].

**Access control — only-owner can call X**
```solidity
function check_setFee_onlyOwner(address caller, uint16 bps) public {
    vm.assume(caller != owner);
    vm.prank(caller);
    try vault.setFee(bps) { assert(false); } catch { }   // must revert
}
```

**No-reentrancy invariant** — a guarded function cannot be re-entered (assert the guard slot is set during the external call).

**Solvency** — `sum(balances) <= totalAssets` holds after any single state transition.

### Step 2 — Run Halmos

```bash
halmos --function check_transfer_preservesSupply --solver-timeout-assertion 0
```

Or via the runner MCP so it shares the Foundry build:

```
mcp__forge-runner__symbolic(tool="halmos", function="check_setFee_onlyOwner")
```

### Step 3 — Interpret the result

- **PASS** = a proof. The property holds for every input within the explored bounds. State the bounds explicitly (e.g. "all `uint256 amt`, loop unrolled to 3").
- **COUNTEREXAMPLE** = a concrete input that violates the property → this is a finding. Minimize it and write a `/exploit` PoC.
- **TIMEOUT / path explosion** = inconclusive, not a pass. Narrow scope (bound array lengths, `--loop` unroll limit, constrain inputs with `vm.assume`) and re-run.

### Step 4 — (Optional) Certora

If a `certora/` config + `.spec` exists, run `certoraRun` with the CVL rule instead — better for complex multi-contract invariants, but requires a cloud prover key.

## Output

```
Prover (Halmos): Vault

  ✓ check_transfer_preservesSupply   PROVED   (∀ to, ∀ amt:uint256)
  ✓ check_setFee_onlyOwner           PROVED   (∀ caller ≠ owner reverts)
  ✗ check_solvency                   COUNTEREXAMPLE
        deposit(1) ; withdraw(2)  →  totalAssets() < Σ balances by 1 wei
        rounding favors withdrawer → drains 1 wei per call
  ⧗ check_K_monotonic                TIMEOUT  (path explosion in swap loop)
        re-run with --loop 2 and bounded reserves

Verdict: 1 proven counter-example (solvency). 2 properties proved. 1 inconclusive.
```

## Notes

- A PASS is only as strong as its bounds — always report what was bounded. See [[confidence-scoring]] for how proofs raise a finding's confidence tier.
- Halmos timing out is common: unbounded loops and large arrays cause path explosion. Bound them.
- Use `/prover` for *proofs*; use `/invariant` for stateful fuzzing that explores deep call sequences Halmos can't reach. They are complementary.
- Counter-examples from the prover are ground truth — promote them straight to PoCs.
