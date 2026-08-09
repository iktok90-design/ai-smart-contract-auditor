---
description: Audit only the git diff vs main (or specified base). Optimized for PR review.
argument-hint: "[base-branch]  (default: main)"
allowed-tools: Read, Grep, Glob, Bash, Agent, Skill
---

# /audit-changes — audit only what changed

For PR review or pre-push verification. Audits only the diff vs `$ARGUMENTS` (default: `main`).

## Procedure

1. **Get the diff.** `git diff --name-only <base>...HEAD -- '*.sol' '*.vy'` gives changed files.
2. **For each changed file:**
   - Read the file and the diff hunk.
   - Identify what changed: new function, modified function, new state var, etc.
3. **Audit the changes with extra attention to:**
   - Upgrade safety — did storage layout change? (use [[storage-layout]])
   - New external-call sites — reentrancy review.
   - New state mutations — access-control review.
   - Changes to signed-message handling — replay review.
   - Changes to oracle reads or price math.
   - Removed `require`s or relaxed checks.
4. **Cross-reference unchanged code.** A diff that adds a new function to a contract requires understanding the *existing* invariants.
5. **Emit findings only for the diff** — but flag pre-existing issues that the diff makes worse.

## Output

```
Audit of diff vs <base>:
  Files changed: N
  Lines changed: +X / -Y
  Findings: <severity breakdown>
```

Per finding, include the diff snippet and a recommended block-on-merge severity.

## CI mode

When run from a hook (`pre-push`, `pre-commit`), this command:
- Reads `severity_threshold` from `.auditsentry.yml`
- Exits 0 if no findings at/above threshold
- Exits 1 with a structured stderr summary otherwise

## Notes

- Don't re-audit code that didn't change.
- A new comment doesn't justify a finding — only changes to *executable* code.
- If the diff is huge, sample the most risky hunks (functions touching state, external calls, signatures) and tell the user the audit was sampled.
