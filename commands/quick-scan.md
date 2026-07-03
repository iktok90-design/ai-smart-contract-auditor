---
description: Fast pre-commit-grade scan. Only catches Critical and High. Optimized for hooks.
argument-hint: "[file-or-dir]"
allowed-tools: Read, Grep, Glob, Bash, Skill
---

# /quick-scan — fast triage

Lighter than `/audit`. Designed to run in pre-commit hooks. Targets only Critical and High findings.

## What's skipped vs `/audit`

- No subagent dispatch (no parallel specialists).
- No exploit chains.
- No invariant pass.
- No trust report.
- No deployment fetching.

## What's kept

- Auto-invoke vuln skills, but only the highest-yield ones for fast detection:
  - reentrancy (CEI violations)
  - access-control (missing modifiers)
  - oracle-manipulation (spot-price reads)
  - unchecked-calls (ignored returns)
  - initialization (public init, missing _disableInitializers)
  - signature-replay (missing nonces/chainId)
  - delegatecall-risks (delegatecall to user input)
  - flash-loan-attacks (spot-balance for vote weight, ERC-4626 inflation)

For each, regex-grep first, then read context only for matches.

## Procedure

1. Resolve target from `$ARGUMENTS` or staged files (`git diff --cached --name-only -- '*.sol'`).
2. For each fast skill, run pattern detection:
   - reentrancy → grep for `.call{value:` followed by state write
   - access-control → grep for state-mutating externals missing modifiers
   - oracle-manipulation → grep for `slot0`, `getReserves`, `latestAnswer`
   - unchecked-calls → grep for `.call(` not assigned to `(bool ok,`
3. Read full function context only for matched lines.
4. Emit Critical/High findings only. Skip everything Medium and below.

## Output

Compact, designed for CLI consumption:

```
AuditSentry quick-scan
  ✗ Vault.sol:142  [C/REENT-001]  withdraw() updates balance after external call
  ✗ Vault.sol:204  [H/ORACLE-001] slot0() used for collateral pricing (sandwichable)
  ⚠ pre-commit threshold: critical — 1 critical, 1 high found → blocking commit
```

Exit code:
- 0 if no findings at/above `severity_threshold` from `.auditsentry.yml`
- 1 if findings at/above threshold (blocks commit/push)

## Notes

- Aim for <5 seconds on a small file, <30s on the whole repo.
- False positives are acceptable; false negatives are not. Quick-scan errs on side of flagging.
- If user runs `/quick-scan` directly (not from a hook), output is the same; the exit code just isn't meaningful.
