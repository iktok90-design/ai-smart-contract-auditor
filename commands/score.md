---
description: Compute a AuditSentry grade (A+ → F) for the contract or repo based on findings from /audit.
argument-hint: "[file-or-dir]"
allowed-tools: Read, Bash, Skill
---

# /score — grade the contract

Compute a single-letter grade. If no recent audit results exist, run `/audit` first.

## Grading rubric

The grade combines three signals:

### 1. Severity counts

Weighted points:
- Critical: 25 each
- High: 10 each
- Medium: 3 each
- Low: 1 each
- Info: 0.1 each

### 2. Centralization score (0-25)

From the trust report ([[centralization-risk]]):
- Multi-sig + timelock on all admin functions → 0
- Multi-sig only (no timelock) → 5
- EOA admin → 15
- EOA + sweep-any-token → 25

### 3. Test coverage / invariant maturity (0-15)

- ≥80% branch coverage + invariants → 0
- 50-80% coverage → 5
- <50% coverage or no test suite → 15

## Final grade

`total = severity_points + centralization_score + coverage_score`

| Total | Grade |
|---|---|
| 0 | A+ |
| 1-3 | A |
| 4-10 | B |
| 11-25 | C |
| 26-50 | D |
| 51-100 | E |
| >100 | F |

**Hard floor:** Any Critical finding caps the grade at **D** regardless of total.

## Output

```
AuditSentry Score
  Severity points:        22  (1 Critical, 0 High, 2 Medium, ...)
  Centralization score:   15  (EOA admin, no timelock)
  Coverage score:          0  (87% branch coverage, invariants ✓)
  ────────────────────────────
  Total:                  37
  Grade:                   D  (capped — Critical finding)
  
  Top issues holding the grade down:
    [C/REENT-001] Reentrancy in withdraw()
    [H/CENT-002] Single-EOA admin with sweep authority
```

## Notes

- Score is opinionated and meant for *relative* comparison and motivation, not blessing for production.
- Score should be reproducible: same findings + same config → same grade.
- Tell the user what the next-best fix to bump the grade would be.
