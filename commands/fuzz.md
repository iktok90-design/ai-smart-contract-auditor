---
description: Generate property-based fuzz tests for a specific function.
argument-hint: "<Contract.function>"
allowed-tools: Read, Write, Bash, Agent, Skill, mcp__forge-runner__*, mcp__fuzz-runner__*
---

# /fuzz — fuzz tests for one function

Lighter than `/invariant` — targets a specific function with bounded random inputs.

For deeper campaigns, drive the dedicated fuzzers via the `fuzz-runner` MCP —
`mcp__fuzz-runner__echidna` (property fuzzing) or `mcp__fuzz-runner__medusa`
(parallel, Go). Call `mcp__fuzz-runner__is_available` first; if a fuzzer isn't
installed the tool returns a labeled sample so the flow still demonstrates.

## Procedure

1. Read the function and identify input types + valid ranges.
2. Generate Foundry fuzz tests:

```solidity
function testFuzz_DepositReturnsCorrectShares(uint256 amount) public {
    amount = bound(amount, 1, 1e30);
    vm.deal(address(this), amount);
    uint256 sharesBefore = vault.totalSupply();
    uint256 minted = vault.deposit{value: amount}();

    assertEq(vault.totalSupply(), sharesBefore + minted);
    assertGt(minted, 0, "minted zero shares");
}
```

3. Add property assertions specific to the function:
   - Idempotency: f(f(x)) == f(x) for view-or-once-only ops
   - Inverse: encode(decode(x)) == x
   - Monotonicity: f(a) ≤ f(b) for a ≤ b on monotone fns
   - Conservation: balance changes sum to zero on transfers

4. Run with `mcp__forge-runner__test(flags="--fuzz-runs 10000")`.

## Output

Same as `/test-gen` but scoped to the target function.

## Notes

- Use `bound(input, lo, hi)` instead of `vm.assume` for better coverage.
- Don't fuzz with unrealistic ranges (e.g. transfer amounts of `2**256-1`) — bound to plausible values.
- For functions with multiple inputs, fuzz them independently or together depending on their semantic coupling.
