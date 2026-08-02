---
description: Deep audit — same as /audit but spawns more parallel subagents, runs multi-pass review, and chases exploit chains across files.
argument-hint: "[file-or-dir]"
allowed-tools: Read, Grep, Glob, Bash, Agent, Skill
---

# /audit-deep — multi-pass adversarial audit

Like `/audit`, but slower and more thorough. Use this for pre-launch or pre-mainnet-fork reviews where time is acceptable but escapes are not.

## Differences vs `/audit`

1. **Two-pass review.** First pass: per-skill findings. Second pass: cross-finding analysis — can any two findings be combined into an exploit chain?
2. **More specialist dispatches.** Always invoke `attacker` AND `defender` AND `gas-optimizer` AND any matching protocol specialists.
3. **Cross-contract reachability.** Trace external call graphs: which functions can call which, with what authorizations? Look for trust violations across the call graph.
4. **Invariant generation pass.** Spawn `invariant-writer` to identify protocol invariants that the contract intends to hold; check each one against the code.
5. **Historical context.** Use `c4-history` and `sherlock-history` MCPs to look for similar findings in the historical database — protocols of this type have lost funds via X; does this code have X?

## Procedure

Run `/audit` end-to-end first. Then:

### Pass 2: Exploit-chain hunt

For each (high or critical) finding F:
- Could F be amplified by another finding? E.g. flash-loan + price oracle + missing access control → drain.
- Could F be amplified by an external integration (a specific token, a specific oracle behavior)?
- Generate at least one candidate exploit chain per Critical finding.

### Pass 3: Invariant violation hunt

Run `invariant-writer` to extract:
- Token: `totalSupply == sum(balanceOf)`
- Vault: `totalAssets >= sum(convertToAssets(balanceOf))`
- AMM: `K = reserve0 * reserve1` monotonically non-decreasing after swap fees
- Lending: `sumDebt <= sumCollateralAtPrice * MAX_LTV`

For each invariant, prove or break it. If broken, emit a finding.

### Pass 4: Historical pattern match

For each Critical / High finding, query `c4-history-mcp` and `sherlock-history-mcp`:
- Has a protocol of this type ever lost funds to this exact pattern?
- Cite the historical incident in the finding write-up.

### Output

Same format as `/audit`, with additional sections:

- **Exploit chains discovered** (chain ID → list of finding IDs, narrative description)
- **Invariants checked** (invariant → status: holds / broken-finding-ID)
- **Historical context** (per finding, link to similar past incident if found)

## Notes

- Budget will be larger. Expect to read the whole repo, not just touched files.
- If the user wants it fast, they should use `/audit` or `/quick-scan` instead.
