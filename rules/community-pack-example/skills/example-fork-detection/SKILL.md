---
name: example-fork-detection
description: TEMPLATE — replace with the description of your rule. Should activate on the specific code patterns your fork has. Activate on `<your trigger keywords or function names>`.
---

# Example fork-specific rule

This is a template for community-authored AuditSentry skills. Replace every section.

## When this applies

Describe the specific situation. Be concrete:
- Which import is present?
- Which function name is called?
- Which inheritance chain?
- Which deployment context (mainnet, L2, fork)?

## Detection patterns

For each pattern, give:

```solidity
// example of the bug shape
function vulnerableThing() external {
    // ...
}
```

Followed by a one-paragraph explanation.

## Severity rubric

| Pattern | Severity |
|---|---|
| <pattern A> | **Critical** |
| <pattern B> | **High** |

## Remediation patterns

How to fix. Include code diffs where possible.

## False-positive notes

When does the pattern NOT indicate a bug?

## Related

- [[other-auditsentry-skill]] — link to base skills your rule extends
