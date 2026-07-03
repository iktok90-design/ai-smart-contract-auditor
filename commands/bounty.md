---
description: Generate a responsible-disclosure bounty submission from a confirmed finding — Immunefi / protocol bounty / SEAL 911 formats.
argument-hint: "<finding-id>  [--target immunefi|protocol|seal911]"
allowed-tools: Read, Write, Bash, Agent, Skill
---

# /bounty — generate a bounty submission

After you find a real bug in a *deployed* contract, this command prepares a responsible-disclosure submission.

## Procedure

### Step 1 — Confirm the finding is real

Require the finding ID to have a passing `/exploit-live` proof on a fork. Otherwise, refuse to generate (no theoretical disclosures).

### Step 2 — Pick the target

- `immunefi` — uses Immunefi's submission format
- `protocol` — uses the protocol's documented bounty form (auto-detect from chain + address)
- `seal911` — SEAL 911 (emergency, for actively exploitable critical vulns)

### Step 3 — Generate the submission

Sections required by most bounty programs:

1. **Title** (one-line, severity-loaded)
2. **Severity** (per the protocol's bounty scale — usually Critical/High/Medium)
3. **Impact summary** (who can lose what, how much, how fast)
4. **Affected contracts** (addresses, on which chain)
5. **Bug description** (clear, technical, no marketing)
6. **Reproduction steps** (step-by-step)
7. **Working PoC** (paste the Foundry test from `/exploit-live`)
8. **Recommended mitigation** (the patch from `/remediate`)
9. **Disclosure timeline** (today's date as initial disclosure)

### Step 4 — Sensitive-data warnings

Before output, scan for:
- Hardcoded private keys, mnemonics
- Personal info
- Internal-only URLs

If found, refuse to write to disk; warn the user.

### Step 5 — Output

Write to `auditsentry-reports/bounty-<finding-id>-<date>.md`. Tell the user:

```
✓ Bounty submission generated: auditsentry-reports/bounty-REENT-001-2026-05-12.md

  Target:        Immunefi
  Project:       Acme Protocol (acme.fi)
  Severity:      Critical
  Estimated payout (per program): $50K - $250K

Next steps:
  1. Review the submission for accuracy
  2. Submit at https://immunefi.com/bounty/acme/
  3. DO NOT share the PoC publicly until the protocol acknowledges

If actively exploitable in the wild RIGHT NOW:
  → Contact SEAL 911: https://seal-911.com  (emergency channel)
```

## Notes

- Refuse to generate if the finding is theoretical (`/exploit-live` must have a passing PoC).
- Always remind about non-public disclosure.
- For SEAL 911 emergencies, include a direct Discord / Telegram link to the on-call team.
- Don't generate "marketing" prose — bounty triage teams want signal, not stories.
