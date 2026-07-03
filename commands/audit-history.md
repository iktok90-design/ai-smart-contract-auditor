---
description: Pull past public audits (Code4rena, Sherlock, Spearbit, etc.) for a deployed contract or known protocol.
argument-hint: "<address-or-protocol-name>"
allowed-tools: Bash, Agent, mcp__c4-history__*, mcp__sherlock-history__*, mcp__block-explorer__*
---

# /audit-history — what's been found before

For `$ARGUMENTS` (an address or protocol name), retrieve historical audit findings.

## Procedure

1. **Resolve target.** If `$ARGUMENTS` is an address, use `block-explorer` to get the contract name and protocol attribution. If it's a name, query both history MCPs directly.
2. **Query both history MCPs in parallel.**
   ```
   mcp__c4-history__search(protocol=<name>)
   mcp__sherlock-history__search(protocol=<name>)
   ```
3. **Aggregate.** Deduplicate findings across sources. Group by:
   - Severity (Critical → Info)
   - Vuln class (mapped to a [[skills]] category)
   - Date
4. **Cross-reference current code.** If we have current source (via `block-explorer` or local repo):
   - For each historical finding, check whether the affected pattern is still present.
   - Flag findings where the *fix is unclear* in the current code.

## Output

```
Historical findings for <protocol>:

  Audited by: Code4rena (2024-06), Sherlock (2024-09), Spearbit (2024-12)
  Total public findings: N (C: x, H: y, M: z, L: w, I: v)

  Top critical:
    [C4-2024-06 #042] Cross-function reentrancy in withdraw()
       Pattern: reentrancy (cross-function)
       Status:  ✅ fixed in commit 0xabc...
    [Sherlock-2024-09 #007] Read-only reentrancy on getReserves
       Pattern: reentrancy (read-only)
       Status:  ⚠ similar pattern still present at Vault.sol:142

  Carry-over risks (still applicable):
    [...]
```

## Why this is useful

- New auditors can avoid duplicating prior work.
- Pattern recurrence is a strong signal that the team may have missed the lesson.
- Useful pre-audit context: "what did the last firm find?"

## Notes

- C4 / Sherlock histories are public but rate-limited; cache results via the MCP.
- For protocols audited by private firms (Trail of Bits, OpenZeppelin), public findings may not exist — report "no public history" rather than fabricating.
