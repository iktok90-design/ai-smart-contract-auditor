---
name: confidence-scoring
description: Always-on meta-skill — for every finding produced, attach a confidence level (HIGH/MEDIUM/LOW) and a reasoning trace. Activate on every /audit, /audit-deep, /audit-changes, /audit-live, /quick-scan invocation.
---

# Confidence scoring (meta-skill)

Per-finding confidence is what separates a noisy linter from a usable auditor. Always attach confidence.

## Confidence levels

### HIGH
- Pattern matches exactly with no ambiguous preconditions.
- Working exploit possible (or already drafted via [[exploit-poc-writer]]).
- Affected line is reachable from a public/external function with no role gating.
- Cross-verified by attacker subagent or `/verify-finding`.
- Historical incident matches the same pattern at this severity.

### MEDIUM
- Pattern matches but exploit requires non-trivial preconditions:
  - Specific token type (rebasing / fee-on-transfer)
  - Specific chain configuration (sequencer down on L2, oracle behavior)
  - Multi-actor coordination
- Reachability through trusted-only call paths.
- One specialist subagent confirms, another offers a benign explanation.

### LOW
- Pattern theoretically present but practical exploitability uncertain.
- Heavy reliance on assumptions about external integrations not auditable.
- Defense-in-depth gaps with no clear attack.
- Conflicting evidence between passes (in `/audit-strict`).

## Reasoning trace requirement

Every finding includes a "How I reached this conclusion" snippet:

```
Reasoning:
  1. Function withdraw() at Vault.sol:140 sends ether via low-level call.
  2. State update (balance[msg.sender] = 0) happens after the call (CEI violated).
  3. Receiver address is user-controlled (msg.sender).
  4. No nonReentrant modifier on the function.
  5. No external mitigation in surrounding code.
  Conclusion: classic reentrancy, exploitable in a single tx.
  Cross-check: attacker subagent independently constructed a PoC (passing).
  → Confidence: HIGH
```

## When to downgrade

Always downgrade if:
- The "exploit" requires the attacker to compromise an admin key.
- The pattern is present but mitigated by an immutable, audited library call.
- The vuln class is present but the *capability* requires unrealistic state.

## When to escalate to HIGH

Upgrade to HIGH only if:
- You can articulate the exploit in concrete terms.
- You can identify the specific value at risk.
- You can write a PoC that compiles (or you cite a historical incident).

## Output integration

In the standard finding format:
```
[<ID> | <Severity>] <Title>
  Confidence: HIGH | MEDIUM | LOW
  Reasoning:  <trace>
  ...
```

## Don't

- Don't mark every finding HIGH to look thorough.
- Don't mark a real, well-evidenced finding LOW to be cautious — that defeats the purpose.
- Don't downgrade Critical severity to compensate for low confidence — they're orthogonal axes.

## Related

- [[multi-pass-self-critique]] — uses confidence to filter
- [[false-positive-feedback-loop]] — low-confidence findings are dismissal candidates
- [[known-good-comparison]] — known-good match → upgrade confidence
