---
description: Second-opinion mode — re-check a specific finding with deeper analysis. Triages true vs false positives.
argument-hint: "<finding-id>"
allowed-tools: Read, Bash, Agent, Skill, mcp__forge-runner__*
---

# /verify-finding — deeper re-check on one finding

Auditors don't trust first-pass output. This command runs a focused, more rigorous review of a single finding.

## Procedure

### Step 1 — Read the finding deeply

Pull the finding. Read the *entire* affected function plus every call site (callers and callees).

### Step 2 — Spawn parallel verifications

Dispatch in parallel (single message, multiple Agent calls):

1. **`attacker`** subagent: try to construct a working exploit. If successful, confirm finding is real.
2. **`defender`** subagent: try to find a reason the finding is benign. If successful, confirm finding may be a false positive.
3. **Skill re-application**: re-run the relevant vuln skill from scratch on the affected lines, without the prior finding in context.
4. **Known-good comparison**: if a canonical reference exists (OZ/Solady equivalent), diff the affected pattern against it.

### Step 3 — Synthesize

Combine the verdicts:

- **All four say "real"** → confidence = HIGH, finding upheld.
- **3 say "real", 1 dissent** → confidence = MEDIUM, surface the dissent.
- **Split 2/2** → confidence = LOW, request user judgment.
- **All four say "false positive"** → auto-suggest `/dismiss`.

### Step 4 — Output

```
Verification of REENT-001 (Reentrancy in withdraw()):

  attacker:           ✓ exploit constructed; vault drained in 1 block
  defender:           ✗ found no benign explanation
  skill re-check:     ✓ matched reentrancy pattern (CEI violated)
  ref compare (OZ):   ✗ pattern absent in OZ's withdraw equivalent

  Verdict:    HIGH confidence — finding is real
  Exploit:    test/exploits/ExploitREENT-001.t.sol (passes)
```

vs. false-positive case:

```
Verification of CENT-007 (Owner can set fee):

  attacker:           ✗ no exploit — owner is a 5-of-7 multi-sig with 48h timelock
  defender:           ✓ timelock + multi-sig is industry-standard mitigation
  skill re-check:     ✓ pattern matched (technically)
  ref compare:        ✗ same pattern present in OZ AccessControl examples

  Verdict:    LOW confidence — likely false positive
  Recommended action: /dismiss CENT-007 "Multi-sig + 48h timelock mitigates centralization"
```

## Notes

- This is the **second-opinion mode**. Slower than the first pass; the user opted in.
- Don't soften findings just because the protocol is well-known. Real bugs in well-known protocols are real bugs.
- For ambiguous cases, lean toward keeping the finding and lowering confidence rather than dismissing.
