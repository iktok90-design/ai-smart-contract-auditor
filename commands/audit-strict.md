---
description: Multi-pass consensus audit — runs the audit twice with different prompts, only reports consensus findings. Aggressively cuts false positives.
argument-hint: "[file-or-dir]"
allowed-tools: Read, Bash, Agent, Skill
---

# /audit-strict — consensus-based audit

Same surface as `/audit`, but each finding must be *independently produced* by two passes to be reported.

## Procedure

### Step 1 — Pass A: bottom-up

Read the code function by function. For each function:
- Apply the vuln skills.
- Emit candidate findings.

### Step 2 — Pass B: top-down

Dispatch the `attacker` subagent (fresh context, no prior findings shared). Ask it:
- "What would you steal here?"
- "What's the cheapest exploit?"
- Let it identify findings without skill-priors.

### Step 3 — Consensus

Compute the intersection:

- Findings that appear in **both passes** → keep, confidence HIGH.
- Findings that appear in **only one pass** → keep with confidence MEDIUM, flag as single-source.
- Findings produced by skill-checks that *match the attacker's exploit narrative* → consensus, even if the wording differs.

### Step 3b — Specialist panel (deep mode, optional)

For the highest-stakes audits, escalate consensus from 2 passes to an N-of-M
panel. Dispatch every specialist relevant to the detected protocol type (per the
`/audit` dispatch table) **in parallel, each with fresh context**, plus
`attacker` and `defender`. Require a finding to be surfaced by **≥3 independent
agents** (or ≥2 for a Critical) before it reaches the HIGH-confidence tier;
single-agent findings drop to MEDIUM with a single-source flag. This trades cost
for the strongest false-positive suppression AuditSentry offers.

### Step 4 — Output

```
Strict audit (two-pass consensus):

  Pass A findings:  8
  Pass B findings:  6
  Consensus (both): 5     ← reported as HIGH confidence
  Pass-A-only:      3     ← reported as MEDIUM confidence with disclaimer
  Pass-B-only:      1     ← reported as MEDIUM confidence with disclaimer

  Final report: 5 high-confidence findings, 4 needing user judgment.
```

## When to use

- Pre-launch audits where false-positive avoidance is critical
- Audit-of-audits (when you don't trust the prior tool's output)
- Generating a "we found this *twice independently*" claim for reports

## When NOT to use

- Quick triage (use `/quick-scan`)
- PR review (use `/audit-changes`)
- Time-budgeted runs (this is ~2× slower than `/audit`)

## Notes

- The two passes must use different reasoning starting points. Don't share findings between them in the prompt.
- Consensus is not infallible — both passes can miss the same bug. Pair with `/verify-finding` for paranoia mode.
- If consensus is dramatically lower than either single-pass output (say <50%), surface that as a "noisy" signal: the codebase may be unusual or the skills may need tuning.
