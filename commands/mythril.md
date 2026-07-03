---
description: Run Mythril (symbolic execution) and have Claude triage its findings — turn symbolic counter-examples into Foundry PoCs.
argument-hint: "[file]"
allowed-tools: Read, Bash, Agent, Skill, mcp__mythril-runner__*, mcp__forge-runner__*
---

# /mythril — AI triage on top of Mythril

Mythril uses symbolic execution to find exploits. Powerful, but its output is dense and its false-positive rate is high. AuditSentry: triage + turn symbolic findings into runnable PoCs.

## Prerequisites

`pip install mythril`. If it isn't installed, the `mythril-runner` MCP returns a
labeled sample so the workflow still runs end-to-end.

## Procedure

### Step 1 — Run Mythril

Preferred (offline-safe):

```
mcp__mythril-runner__analyze(target=<file>)
```

The result carries `mythril` (raw Mythril JSON) and `stub: true` when the sample
was used. Normalize via the parser:

```bash
echo '<mythril-json>' | node "${CLAUDE_PLUGIN_ROOT}/scripts/dist/parse-mythril.js"
```

Or run directly: `myth analyze <file> -o json`. Capture issues, each with a SWC
ID, severity, and a symbolic-execution path.

### Step 2 — For each Mythril issue

- Read the affected function.
- Look at the symbolic path Mythril provides.
- Turn the path into a **concrete Foundry test**:
  - Map symbolic vars to concrete inputs from Mythril's counter-example.
  - Set up state per the path.
  - Run the test via `forge-runner`.
- If the test passes (exploit succeeds) → True positive, output the PoC.
- If the test fails → either the path requires unreachable state, or the symbolic engine over-approximated. Mark as theoretical or FP.

### Step 3 — Output

```
Mythril + AuditSentry triage:

  Mythril raw issues: 22
  After AuditSentry triage:
    Concrete PoCs that pass:  4   (real bugs)
    Theoretical paths only:   12  (no realistic exploit)
    False positives:          6   (Mythril over-approximated)

Concrete PoCs:
  [SWC-107] Reentrancy in Vault.withdraw
    Mythril path:  attacker → withdraw → fallback re-enters withdraw
    AuditSentry PoC:  test/exploits/ExploitMythril-SWC107.t.sol  (passes)
    Confidence:    HIGH
```

## Notes

- Mythril is slow on large contracts — warn the user upfront and offer to scope to one file.
- For modern Solidity (>=0.8), some classic SWCs (integer-overflow) are pre-handled — auto-downgrade those.
- Output should ALWAYS include a working test if confidence is HIGH.
