---
description: Run Slither and have Claude triage its findings — separate true positives from false positives, write PoCs for real bugs.
argument-hint: "[file-or-dir]"
allowed-tools: Read, Bash, Agent, Skill, mcp__slither-runner__*, mcp__forge-runner__*
---

# /slither — AI triage on top of Slither

Slither has high recall (catches a lot) but low precision (lots of false positives). AuditSentry's role: be the AI layer that triages.

## Prerequisites

Slither installed: `pip install slither-analyzer`. If it isn't installed, the
`slither-runner` MCP returns a labeled sample so the workflow still demonstrates
end-to-end — but real triage needs the real binary.

## Procedure

### Step 1 — Run Slither

Preferred (works offline with a labeled fallback):

```
mcp__slither-runner__analyze(target=<file-or-dir>)
```

The result carries `slither` (raw Slither JSON) and `stub: true` when the sample
was used. Pipe the `slither` payload through the parser for normalized findings:

```bash
echo '<slither-json>' | node "${CLAUDE_PLUGIN_ROOT}/scripts/dist/parse-slither.js"
```

Or call Slither directly if you prefer: `slither <target> --json - 2>/dev/null`.
The JSON contains detectors fired, severity (Slither's own), affected lines.

### Step 2 — For each Slither finding

- Read the affected lines.
- Apply the relevant AuditSentry vuln skill.
- Determine: is this exploit-able in *this specific context*?
- Categorize:
  - **True positive (confirmed):** real, write a `/exploit` PoC if possible.
  - **True positive (theoretical):** real per Slither but no exploit path in this context — note and downgrade severity.
  - **False positive:** Slither over-flagged; explain why.
  - **Insufficient context:** Slither's detector requires data Slither doesn't have (e.g. trust assumptions); request user input.

### Step 3 — Output

```
Slither + AuditSentry triage:

  Slither raw findings: 47
  After AuditSentry triage:
    Confirmed exploitable:    3     (PoCs generated)
    Real but contextual:      11    (downgraded severity)
    False positives:          28    (auto-dismissed with reasoning)
    Needs user judgment:      5

Confirmed exploitable:
  [reentrancy-eth] Vault.withdraw at src/Vault.sol:142
    Slither severity: HIGH | AuditSentry: HIGH-CONFIRMED
    PoC: test/exploits/ExploitREENT-Slither-001.t.sol  (passes)

False positives (sampled):
  [dead-code] Bridge._verify at src/Bridge.sol:200
    Slither flagged as unreachable; AuditSentry: reachable via fallback receiver,
    but pattern is a defensive-only path with no exploit. Dismissed.
```

## Why this is useful

- Slither alone produces too much noise to action.
- AuditSentry's reasoning lets the user act on the *signal*, not the raw output.
- Positioning: not a Slither replacement — Slither's *triage layer*.

## Notes

- Don't suppress Slither findings without writing the *reason* in the dismissal record.
- Where AuditSentry's own skills already covered the issue, deduplicate against AuditSentry's prior `/audit` findings.
