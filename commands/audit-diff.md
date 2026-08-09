---
description: Diff two AuditSentry audit reports (before vs after) to track regressions — what's new, what's fixed, and whether the grade moved.
argument-hint: "<old-report.json> <new-report.json>"
allowed-tools: Read, Bash
---

# /audit-diff — regression diff between two audits

Did your fix actually resolve the finding? Did it introduce a new one? Run two
audits and diff the JSON reports. Unlike `/diff-audit` (which compares your code
against a canonical reference), this compares two **AuditSentry reports** of the
*same* contract over time — perfect for CI gates and "before/after a fix".

## Procedure

### Step 1 — Produce two reports

Each side is a AuditSentry report JSON (the `schemas/finding.schema.json` shape,
i.e. what `/report --format json` and `parse-slither` / `parse-mythril` emit):

```bash
git stash && /audit src/Vault.sol   # → save as before.json
git stash pop && /audit src/Vault.sol   # → save as after.json
```

### Step 2 — Diff

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/dist/diff-reports.js" \
  --old before.json --new after.json
```

The engine keys findings by `id`, so it tracks each finding across runs:
`added` (in new only), `fixed` (in old only), `persisting` (both), per-severity
`countsDelta`, and the `gradeChange`. It exits **non-zero when a new High or
Critical appears** (`regressed: true`) so it doubles as a CI gate.

### Step 3 — Output

```
Audit diff: before.json → after.json

  3 new, 2 fixed, 1 persisting · grade F → C · ✓ improved

  Fixed:
    ✓ [Critical] REENT-001  reentrancy in withdraw()
    ✓ [Medium]   GAS-010    unbounded loop
  New:
    + [High]     ACCESS-003 missing onlyOwner on setOracle()
  Persisting:
    • [High]     ORACLE-002 spot oracle still in use

  Counts Δ: critical -1, high +0, medium -1
```

## Notes

- Use it in CI after `/audit-changes`: a non-zero exit means the PR introduced a
  new high/critical relative to the base branch's report.
- `--out delta.json` writes the structured diff for further processing.
- For comparing code against an upstream library instead, use `/diff-audit`.
- Confirm a `fixed` finding is genuinely resolved (and not just relocated to a new
  id) with `/verify-finding`.
