---
description: Full security audit of a Solidity/Vyper/Rust contract or directory. Runs the entire vuln-skills library and dispatches DeFi specialist subagents based on detected protocol type.
argument-hint: "[file-or-dir]  (omit to audit entire repo per .auditsentry.yml)"
allowed-tools: Read, Grep, Glob, Bash, Agent, Skill
---

# /audit — full security audit

You are conducting a thorough smart contract security audit. Be rigorous; be skeptical. Treat every line of state-mutating code as if an adversary will read it after you do.

## Target

`$ARGUMENTS` — if empty, default to the include/exclude globs from `.auditsentry.yml` at the repo root (fall back to `src/**/*.sol contracts/**/*.sol` if no config).

## Procedure

### Step 1 — Inventory the target

- Read the target file(s) and any directly imported files in-repo.
- Identify the protocol type. Look for tell-tales:
  - ERC-20 + Pair/Pool/Factory → AMM (V2/V3/V4)
  - cToken/aToken/lToken, `LendingPool`, `comptroller`, `liquidate` → lending
  - `stake` + `rewards` + checkpoints → staking
  - `mint`/`burn` with cross-chain Merkle / sigs → bridge
  - Governor / Timelock / proposal → governance
  - ERC-4626 / vault / strategies → yield aggregator
  - ERC-721 / ERC-1155 / royalties → NFT
- Detect language: Solidity, Vyper, Yul/assembly-heavy, Rust (Stylus/CosmWasm/Anchor).
- Identify Solidity version. Note version-specific risks (PUSH0, EIP-6780, etc.).

### Step 2 — Auto-invoke vuln skills

The `skills/` library auto-loads based on code patterns. Verify you've covered the relevant categories:

reentrancy · access-control · oracle-manipulation · flash-loan-attacks · mev-frontrunning · signature-replay · storage-layout · initialization · unchecked-calls · dos-vectors · integer-issues · delegatecall-risks · tx-context-misuse · token-compatibility · approval-issues · selfdestruct-eip6780 · inline-assembly · pragma-and-addresses · centralization-risk · permit2-patterns · erc1271-contract-signatures · diamond-eip2535 · erc4626-inflation · erc4337-account-abstraction · cross-chain-messaging · restaking-eigenlayer · intents-erc7683 · vyper-specific · ve-lock-governance · fee-on-transfer · signature-malleability · mev-pbs · liquidation-cascade · oracle-redundancy · cross-contract-state · zk-verifier-bugs

For each that matches code in the target, produce findings.

### Step 3 — Dispatch specialist subagents (parallel)

Based on the signals from Step 1, dispatch the matching specialists in parallel (single message, multiple Agent calls). Use this dispatch table:

| Detected signal | Dispatch agent |
|---|---|
| ERC-20 + Pair/Pool/Factory, swap, hooks | `amm-specialist` |
| LendingPool / cToken / liquidate / health factor | `lending-specialist` |
| stake + rewards + checkpoints | `staking-specialist` |
| cross-chain mint/burn, Merkle, message-passing | `bridge-specialist` + `crosschain-messaging-specialist` |
| Governor / Timelock / proposal / veToken | `governance-specialist` (+ skill [[ve-lock-governance]]) |
| ERC-4626 / vault / strategy | `yield-aggregator-specialist` |
| ERC-721 / ERC-1155 / royalties | `nft-specialist` |
| Heavy Yul / inline assembly | `assembly-auditor` |
| `# @version` / `.vy` (Vyper source) | `vyper-specialist` |
| Deployed on / targets an L2 rollup; sequencer-uptime / L1↔L2 messaging | `l2-sequencer-specialist` |
| Token / staking / vault whose owner powers must be quantified | `economic-rug-specialist` |
| Proof verifier, pairing precompiles, nullifiers, ZK bridge | `zk-verifier-specialist` |
| EntryPoint / UserOperation / paymaster (ERC-4337) | `aa-specialist` |
| EigenLayer / AVS / operator / restaking | `restaking-specialist` |
| ERC-7683 / intents / solver / reactor | `intents-specialist` |

Pick every row whose signal is present — protocols often match several (e.g. an L2 lending vault → `lending-specialist` + `l2-sequencer-specialist` + `economic-rug-specialist`).

**Always** dispatch in parallel with these, regardless of type:
- `attacker` — adversarial review, look for exploit chains
- `defender` — what defenses are missing

### Step 4 — Consolidate findings

For each finding, output:

```
[<ID> | <Severity>] <Title>
  File: <path>:<line>
  Pattern: <vuln class — see skills/>
  Description: <one paragraph: what, how, why>
  Impact: <funds at risk / control plane / DoS / info disclosure / griefing>
  Likelihood: <high | medium | low — given any preconditions>
  Suggested fix: <concrete, code-level>
  Confidence: <high | medium | low>
```

ID format: `<SHORT>-<NNN>` (e.g. `REENT-001`, `ORACLE-003`).

### Step 5 — Severity ranking

Use the C4 / Sherlock-mapped scale:

- **Critical** — direct loss of user funds, no preconditions or trivial preconditions
- **High** — loss of funds with non-trivial preconditions, or loss of protocol control
- **Medium** — minor fund loss, DoS, griefing with cost, or significant centralization
- **Low** — non-exploitable defense-in-depth issues, gas optimizations with security flavor
- **Info** — best practices, naming, docs, gas

When in doubt between two tiers, state both and pick the conservative one — over-reporting is fixable, under-reporting is not.

### Step 6 — Trust report

Emit a separate **Trust Report** section listing every privileged function the protocol owner / multi-sig / admin can call. Use the [[centralization-risk]] skill's output format.

### Step 7 — Summary

End with:

```
Summary
  Critical: N
  High:     N
  Medium:   N
  Low:      N
  Info:     N

Grade: A+ | A | B | C | D | F   (mapped from severity counts)
```

Tell the user the next useful commands: `/exploit <id>` to write a PoC, `/remediate <id>` for a patch, `/report` for the full deliverable.

## Notes

- Read first, then think, then write. Don't list trivially false findings.
- Quote the offending lines (with `file:line` markers) so the user can jump to them.
- Don't hallucinate `pragma` versions or imports — read what's actually there.
- If the file has 0 findings, say so plainly. Don't manufacture issues to look thorough.
