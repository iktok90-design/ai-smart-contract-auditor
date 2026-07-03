---
description: Run forge coverage, identify untested branches, generate tests to close gaps.
allowed-tools: Read, Write, Bash, Agent, mcp__forge-runner__*
---

# /coverage — close test coverage gaps

## Procedure

### Step 1 — Run coverage

```
mcp__forge-runner__coverage(format=json)
```

Returns per-file branch / line / function coverage.

### Step 2 — Identify gaps

For each file under `src/`:
- Lines covered < 90%? Identify which lines.
- Branches covered < 80%? Identify which branches.

### Step 3 — Generate targeted tests

For each gap, generate a test that exercises the uncovered path. Lean on `/test-gen` infrastructure.

Common gap patterns:
- Revert branches (`require` failure paths) — write a test that triggers the revert.
- Conditional logic (`if (x > 10)`) — test both arms.
- Loop edge cases (empty array, single element, max bound).

### Step 4 — Re-run coverage

Verify the new tests close the gaps. Iterate.

### Step 5 — Output

```
Coverage:
  Before:  src/Vault.sol      lines 78% / branches 71%
           src/Oracle.sol     lines 92% / branches 84%
  After:   src/Vault.sol      lines 96% / branches 88%   ✓
           src/Oracle.sol     lines 98% / branches 91%   ✓

Generated:
  test/generated/coverage/VaultGaps.t.sol     (12 tests)
  test/generated/coverage/OracleGaps.t.sol    (4 tests)
```

## Notes

- 100% line coverage is achievable. 100% branch coverage is harder; aim for 90%.
- Some lines are intentionally untested (e.g. unreachable revert in storage-init). Allow `// auditsentry-skip-coverage` inline.
- Coverage is a *minimum*, not a measure of correctness. High coverage + no invariants is misleading.
