---
description: Mark a finding as a false positive (or accepted risk). Future audits won't re-report it.
argument-hint: "<finding-id> <reason>"
allowed-tools: Read, Edit, Write, Skill
---

# /dismiss — false-positive feedback loop

Build a per-project ignore list. Future runs of `/audit` and `/quick-scan` skip dismissed findings.

## Procedure

### Step 1 — Resolve the finding

Pull `$ARGUMENTS[0]` from the latest audit. If not found, error out and tell the user to provide a current finding ID.

### Step 2 — Capture the dismissal

Append to `.auditsentry.yml` `ignore:` section:

```yaml
ignore:
  - id: REENT-001
    path: "src/Vault.sol"
    line: 142
    reason: "Single trusted caller, reviewed 2025-Q4 by 0x...@..."
    dismissed_at: "2026-05-12"
    dismissed_by: "<git config user.email>"
    fingerprint: "<sha256 of file:line:vuln-class>"
```

The **fingerprint** is what future runs match against — so renames don't accidentally un-dismiss the finding (file moves are handled), and code changes around the dismissed line invalidate the dismissal (forcing re-review when the code changes meaningfully).

### Step 3 — Inline option

Also offer to add an inline suppression marker:

```solidity
// auditsentry-ignore: REENT-001 — single trusted caller, reviewed 2025-Q4
function trustedOp() external onlyOwner { ... }
```

Inline is preferred for finding-specific code review trails.

### Step 4 — Output

```
✓ Dismissed REENT-001 (Reentrancy in withdraw())
  Reason:       Single trusted caller, reviewed 2025-Q4
  Recorded in:  .auditsentry.yml
  Fingerprint:  sha256:abc...

Note: if the code around src/Vault.sol:142 changes, the dismissal will auto-expire.
```

## Why this matters

False positives are the #1 reason audit tools get abandoned. Letting users *teach* the tool — with reasons recorded for review trail — converts annoyance into trust.

## Notes

- Always require a `reason`. No silent dismissals.
- Audit trail: dismissed findings still appear in `/report --include-dismissed`.
- Don't allow dismissal of Critical findings without an extra `--force` flag and a more detailed reason.
- Track who dismissed (via git config) for accountability.
