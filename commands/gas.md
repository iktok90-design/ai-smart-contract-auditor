---
description: Gas profile — find expensive operations and suggest optimizations with before/after numbers.
argument-hint: "<file-or-contract>"
allowed-tools: Read, Write, Bash, Agent, Skill, mcp__forge-runner__*
---

# /gas — gas profile and optimization

## Procedure

### Step 1 — Run forge gas report

```
mcp__forge-runner__gas_report()
```

Returns per-function gas costs from the existing test suite.

### Step 2 — Identify expensive ops

Dispatch `gas-optimizer` subagent. It looks for:

- **Storage reads in loops** — should be cached in memory
- **SSTORE on cold slots** that could be merged into one slot (packing)
- **String revert reasons** — use custom errors (`error InsufficientBalance();`)
- **Unbounded loops over storage**
- **`x = x + 1` instead of `++x` / `unchecked { ++x }`** in safe loops
- **Memory vs calldata** for read-only function params (calldata is cheaper)
- **Public vs external** for fns called only externally (external is cheaper)
- **Repeated keccak256 of constants** — precompute
- **`require` over short-circuit** when both sides are equally cheap
- **Bool storage flags** — pack into bitfields if grouped
- **Modifier with body inlined vs reusable** — inline can be cheaper

### Step 3 — Generate suggestions

For each opportunity, produce a diff. Estimate gas saved using a benchmark test.

### Step 4 — Apply and measure

If `--apply`, apply the patches and re-run gas report. Show before/after.

### Step 5 — Output

```
Gas profile for src/Vault.sol:

  Function          Avg   Min   Max   Median
  deposit           147K  142K  158K  144K
  withdraw          203K  189K  225K  198K   ← top spender
  rebalance         412K  398K  431K  410K   ← top spender

Optimization opportunities:

  1. withdraw():
     - Cache `users[msg.sender]` in memory (called 4× in fn body)
     - Estimated savings: 8K gas/call
  2. rebalance():
     - Replace `string memory reason` with custom errors
     - Estimated savings: 12K gas/call
  3. Storage layout:
     - Pack `bool paused` + `uint8 feeRate` + `address admin` into one slot
     - Saves one SSTORE per init: 20K gas
```

Apply with `--apply`. Re-runs the gas report and shows deltas.

## Notes

- Don't sacrifice readability for marginal gas wins.
- Avoid assembly optimizations unless gas savings are >10K and the code is well-commented.
- Re-audit any gas-optimized code — assembly substitutions are a common bug source.
