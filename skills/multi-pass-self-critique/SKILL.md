---
name: multi-pass-self-critique
description: Meta-skill for /audit-strict and high-stakes audits. Run two independent passes with different starting contexts, then keep only consensus findings. Aggressively cuts false positives.
---

# Multi-pass self-critique (meta-skill)

This skill governs the protocol for high-precision audits where false positives are unacceptable.

## When to use

- `/audit-strict` invocations
- Pre-launch audits where the user has explicitly opted into slower, higher-precision review
- Re-audits where prior tools have been noisy

## The protocol

### Pass A — Skill-driven, bottom-up

Read the code line-by-line. Apply the vuln-skill library. Emit candidate findings with reasoning traces.

### Pass B — Exploit-driven, top-down

Fresh context. Pretend you have no prior findings. Approach the contract as an attacker: "What would I steal here? What's the cheapest exploit?" Emit findings.

### Compare

For each Pass-A finding, check Pass-B:
- Did Pass B independently identify this issue (under any name)?
- Does Pass B's exploit narrative match this issue's mechanism?

For each Pass-B finding, check Pass-A:
- Did the skill library flag this?

### Categorize

| Pass A | Pass B | Result |
|---|---|---|
| ✓ | ✓ | **Consensus** — Confidence HIGH, keep |
| ✓ | ✗ | Single-source A — Confidence MEDIUM, keep with note |
| ✗ | ✓ | Single-source B — Confidence MEDIUM, keep with note |
| ✗ | ✗ | Not reported |

### Synthesize

Output the consensus findings as primary, single-source findings as secondary. Be explicit about which is which.

## Why this works

- Each pass has different blind spots. Skill-based misses novel patterns; exploit-based misses subtle CWE patterns.
- Their intersection is the *high-precision* set.
- Their union is the *high-recall* set. Sometimes you want union; for `/audit-strict`, you want intersection.

## Anti-patterns

- **Sharing findings between passes.** Pass B must not see Pass A's findings; that defeats independence.
- **Counting "Pass A finds X, Pass A also finds X in a different file" as consensus.** Same pass = same blind spots.
- **Using the same model temperature for both passes.** Vary the approach, not just the seed.

## Output

```
Multi-pass audit:

  Pass A (skill-driven) findings:     12
  Pass B (exploit-driven) findings:    9
  Consensus (both):                    7   ← HIGH confidence
  Pass-A-only (no exploit found):      5   ← MEDIUM, flagged for review
  Pass-B-only (skills missed):         2   ← MEDIUM, possibly novel patterns

Final report:
  → 7 HIGH-confidence findings (action recommended)
  → 7 MEDIUM-confidence findings (requires user judgment)
```

## Related

- [[confidence-scoring]] — output of this skill drives the confidence label
- [[known-good-comparison]] — third axis: also check against reference impls
- /audit-strict (command)
