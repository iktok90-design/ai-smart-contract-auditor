---
description: Explain a finding in plain English, with examples. Optionally tailored to a beginner audience.
argument-hint: "<finding-id> [--audience=beginner|engineer|exec]"
allowed-tools: Read, Skill
---

# /explain — explain a finding

For `$ARGUMENTS` (finding ID like `REENT-001`), produce a plain-English explanation.

## Default audience: engineer

Assume the reader is a competent Solidity engineer but not a security specialist. Cover:

1. **What the finding is** (one sentence, no jargon).
2. **Why it matters** (concrete impact: "anyone can drain the vault", "the admin can pause withdrawals forever", etc.).
3. **How it works** (short walkthrough of the exploit).
4. **What to do** (the fix, with a code diff if appropriate).
5. **Related real-world incidents** (cite if found in `c4-history` / `sherlock-history`).

## Audience: beginner

For `--audience=beginner`, soften:
- Explain technical terms inline (reentrancy → "when a function pauses in the middle and a sneaky caller jumps in to drain it").
- Use analogies (e.g. "withdrawing from an ATM that gives you cash before subtracting the balance").
- Skip "EIP-712 domain separator" details; focus on the user impact.

## Audience: exec

For `--audience=exec`:
- One paragraph max.
- Lead with the dollar value at risk and the probability of exploitation.
- Skip the code; just describe risk.
- Compare to a known incident the reader is likely to recognize ("similar to the $X exploit of Y in 20ZZ").

## Notes

- Don't be condescending to beginners.
- For executives, don't soften — they need the truth to make budget calls.
- If the finding ID isn't in the current audit context, ask the user for it or remind them to run `/audit` first.
