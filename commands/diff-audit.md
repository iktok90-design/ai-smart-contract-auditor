---
description: Diff the contract against a canonical reference implementation (OZ, Solady, Uniswap V3, etc.) and flag suspicious deltas.
argument-hint: "<file>  --reference <openzeppelin|solady|uniswap-v3|...>"
allowed-tools: Read, Bash, Agent, Skill
---

# /diff-audit — compare against canonical reference

Many contracts are forks-with-tweaks of OZ/Uniswap/Compound. Audit the *deltas*, not the whole thing.

## Procedure

### Step 1 — Identify reference

`--reference` options (extensible):

- `openzeppelin/erc20` → `@openzeppelin/contracts/token/ERC20/ERC20.sol`
- `openzeppelin/erc721` → `@openzeppelin/contracts/token/ERC721/ERC721.sol`
- `openzeppelin/erc4626` → `@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol`
- `openzeppelin/governor` → `@openzeppelin/contracts/governance/Governor.sol`
- `openzeppelin/accesscontrol` → `@openzeppelin/contracts/access/AccessControl.sol`
- `solady/erc20`, `solady/erc721`, `solady/erc4626`, `solady/ownable`
- `uniswap-v2/pair`, `uniswap-v3/pool`, `uniswap-v4/hook-template`
- `aave-v3/pool`, `compound-v3/comet`
- `safe/proxy`, `safe/factory`

If user passes a path, use that file as the reference.

### Step 2 — Pull both files

Load the user's contract and the reference. Be specific about reference version (pin to a release commit).

### Step 3 — Compute structural diff

Not just `diff` — semantic compare:
- New functions added (vs reference)
- Existing functions modified (signature or body)
- New state variables (vs reference layout)
- Removed checks (`require`, `if`, modifier)
- Changed modifiers (e.g. `nonReentrant` removed)
- Changed constants (fee rate, decimals)
- Different access-control wiring

### Step 4 — Audit each delta

For each delta, ask:
- *Why* was this changed?
- Does the change introduce a vuln class? Auto-invoke relevant skills.
- Does it weaken a security check?
- Does it modify an invariant the reference relied on?

### Step 5 — Output

```
Diff audit: src/MyToken.sol vs openzeppelin/erc20@v5.0.2

Deltas:
  + Added function: blacklist(address)              ← centralization (no timelock)
  ~ Modified _transfer:
      - Removed: if (from == address(0)) revert ZeroFrom();
      - Added:   if (blacklisted[from]) revert Blacklisted();
  + Added storage: mapping(address => bool) blacklisted at slot 4
  ~ Modified mint: now also takes (bool fromTreasury) param

Risk assessment:
  HIGH:  blacklist() has no timelock + no escape hatch for legitimately blacklisted user funds
  HIGH:  Removed zero-from check → minting bypass possible
  MED:   New storage slot — verify upgrade safety
```

## Why this is useful

- Most exploits in forks happen in the *diff*, not the original.
- Auditors can prioritize.
- Highlights "what's actually new about this protocol" for review.

## Notes

- Pin reference versions. OZ v4 and v5 differ substantially.
- If the user's contract has *no* clear reference, this command isn't the right one.
- For Uniswap V4 hooks, diff against the Hook template (the V4-specific footgun catalog).
