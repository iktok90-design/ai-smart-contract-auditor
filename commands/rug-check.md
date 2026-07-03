---
description: Fast owner-power / rugability scan — score how much unilateral control the deployer holds and return a 0-100 rug-risk verdict.
argument-hint: "[file-or-address] [--chain <c>]"
allowed-tools: Read, Grep, Glob, Bash, Agent, Skill, mcp__token-metadata__*
---

# /rug-check — can the owner rug you?

A quick, high-signal scan for the one question every holder actually cares about: how much power does the deployer have, and can they drain, mint, freeze, or trap funds at will? Returns a single rugability score and an itemized owner-powers checklist.

## Procedure

### Step 1 — Resolve the target

`$ARGUMENTS` may be a local source file/dir or a deployed address with `--chain`. For a deployed token, pull live safety metadata first:

```
mcp__token-metadata__check_safety(chain=<c>, address=<address>)
```

This returns honeypot flags, tax/fee hooks, holder concentration, and LP-lock status to fold into the score.

### Step 2 — Dispatch the rug specialist

Dispatch the `economic-rug-specialist` agent over the source. It hunts for unilateral owner powers and reads the relevant skills ([[centralization-risk]], [[access-control]]).

### Step 3 — Scan owner powers

Grep + reason over each power. Each present power adds weight to the score:

```bash
grep -nE 'onlyOwner|onlyRole|_owner|hasRole' src/**/*.sol
```

- **Drain** — `withdrawAll`, `sweep`, `rescueTokens`, arbitrary `call`/`transfer` of pooled funds (+25)
- **Mint** — `mint()` reachable by owner, no cap (+20)
- **Pause-forever** — `pause()` with no auto-unpause / timelock (+15)
- **Blacklist / freeze** — `blacklist`, `setFrozen`, transfer hooks gating addresses (+15)
- **Fee / reward change** — owner sets `feeBps`/`taxBps` with no cap or to 100% (+10)
- **Upgradeable, no timelock** — UUPS/Transparent proxy whose admin is an EOA with no delay (+20)
- **Hidden owner** — ownership behind assembly, a second admin role, or a delegatecall-reachable setter (+15)

### Step 4 — Score and verdict

Sum weights, cap at 100. Map to a verdict:

- `0–29` → **SAFE**
- `30–59` → **CAUTION**
- `60–100` → **HIGH RUG RISK**

## Output

```
Rug check: 0xToken… (base)

  Rugability score: 78 / 100  →  HIGH RUG RISK

  Owner powers:
    ✗ drain pooled funds      owner can call sweep(address,uint256) on any token   (+25)
    ✗ unlimited mint          mint(to,amt) is onlyOwner, no maxSupply              (+20)
    ✗ upgradeable, no timelock UUPS admin is an EOA (0xEOA…), 0s delay             (+20)
    ✓ pause                    no pause function
    ✗ fee change               setTaxBps() uncapped — owner can set to 99%         (+13)
    ✓ blacklist                none
    ✓ hidden owner             single visible owner, no shadow admin

  Token metadata: LP not locked, top holder 41% supply, sell-tax hook present.

Verdict: HIGH RUG RISK — owner can mint, drain, and instantly upgrade. Do not LP.
```

## Notes

- This is the *fast* scan. For a full audit run `/audit-strict`; for cross-chain owner drift run `/audit-multi-chain`.
- Score is heuristic, not a proof — a high score means "trust the team or walk away," not "exploit exists today."
- A multisig + timelock owner sharply lowers the score even when powers exist; an EOA owner sharply raises it.
- For deployed tokens always combine source analysis with `token-metadata` — bytecode-only honeypots won't show in source.
