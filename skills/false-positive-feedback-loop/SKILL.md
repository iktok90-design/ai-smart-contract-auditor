---
name: false-positive-feedback-loop
description: Meta-skill for managing user-dismissed findings. Before reporting any finding, check it against the project's .auditsentry.yml ignore list and inline auditsentry-ignore markers. Activate on every audit command.
---

# False-positive feedback loop (meta-skill)

False positives are the #1 reason audit tools get abandoned. This skill governs the state-persistent mechanism for "user told me this is fine, don't report it again."

## Sources of dismissals

### 1. `.auditsentry.yml` `ignore:` section
```yaml
ignore:
  - id: REENT-001
    path: "src/Vault.sol"
    line: 142
    fingerprint: "sha256:abc..."
    reason: "Single trusted caller, reviewed 2025-Q4"
    dismissed_at: "2026-05-12"
    dismissed_by: "alice@example.com"
```

### 2. Inline markers in code
```solidity
// auditsentry-ignore: REENT-001 — single trusted caller
function trustedOp() external onlyOwner { ... }
```
Effective for next ~5 lines.

### 3. `.auditsentryignore` (file glob)
```
# .auditsentryignore
test/**
script/**
mocks/**
```
Skip these paths entirely.

## Procedure (run before reporting findings)

For each candidate finding F:

### Step 1 — Fingerprint
Compute `sha256(file_path + ":" + line + ":" + vuln_class)`. This is the unique identifier for "this exact issue at this exact location in this code shape."

### Step 2 — Check ignore list
- If F's fingerprint matches any entry in `.auditsentry.yml ignore:` → check freshness.
- If the surrounding lines (±3 of `line`) have changed since `dismissed_at` (use git blame or content hash) → fingerprint invalidates, re-surface F with note "previously dismissed but code has changed".
- Otherwise → skip F, do not report.

### Step 3 — Check inline markers
Scan within 5 lines above F's location for `// auditsentry-ignore: <id>`.
- If matches F's ID or vuln class → skip F.

### Step 4 — Check path globs
If F's file path matches `.auditsentryignore` → skip F.

### Step 5 — Surface, with metadata
If F survived all checks, include in the report. If it was previously dismissed but is now re-surfaced due to code change, note this:
```
[REENT-001 | High] Reentrancy in withdraw (re-surfaced)
  Previously dismissed: 2025-Q3 (by alice@example.com, reason "single trusted caller")
  Re-surfaced because: code around line 142 changed since dismissal
```

## Audit trail

Every dismissed finding is still queryable via `/report --include-dismissed`. This:
- Lets auditors verify what was suppressed.
- Catches dismissals being abused to hide real bugs.
- Provides accountability.

## Force re-surface

`/audit --no-ignore` ignores the ignore list. Useful for fresh re-audits or external review.

## Constraints

- **Critical findings can't be silently dismissed.** `/dismiss CRITICAL-xxx` requires `--force` flag and `--reason` of ≥30 chars.
- **Dismissals expire on code change.** Fingerprint binds to code shape.
- **Dismissals require a reason.** Silent dismissals are not allowed.

## Why this matters

A first-run audit produces 30 findings, of which 5 are real and 25 are false positives. Without a feedback loop, the user dismisses them by *not running the tool again*. With the loop, the user dismisses the 25 with reasons, and the next run produces 5 — *the real ones*. Trust compounds.

## Related

- /dismiss (command)
- [[confidence-scoring]] — LOW-confidence findings should default to "soft-dismiss" with auto-recheck
- [[multi-pass-self-critique]] — dismissals from prior runs inform future passes
