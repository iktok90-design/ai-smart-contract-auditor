# AuditSentry demo contracts

These contracts are **intentionally vulnerable**. Their purpose is to give you a 30-second "wow" moment when you first install AuditSentry.

> ⚠ DO NOT DEPLOY ANY OF THESE. They will be drained immediately.

## How to use

In Claude Code with AuditSentry installed:

```
/demo                    # run all demos (5 contracts)
/demo reentrancy         # just VulnerableVault.sol
/demo oracle             # just SpotOracleLending.sol
/demo flash-loan         # just FlashLoanGovernance.sol
/demo inflation          # just Inflatable4626.sol
/demo replay             # just ReplayableBridge.sol
```

After auditing one, try:
```
/exploit REENT-001        # generate a working Foundry PoC
/remediate REENT-001      # generate the patch
/report                   # render an audit deliverable
/card                     # generate a shareable PNG audit card
```

## What each demo shows

### `VulnerableVault.sol` — reentrancy + access control
Classic CEI violation in `withdraw`. Plus a missing-modifier `setPaused`, an `onERC721Received`-style notify with ignored return, and an EOA single-key admin with sweep authority.

**Skills triggered:** [reentrancy](../skills/reentrancy/SKILL.md), [access-control](../skills/access-control/SKILL.md), [unchecked-calls](../skills/unchecked-calls/SKILL.md), [centralization-risk](../skills/centralization-risk/SKILL.md).

### `SpotOracleLending.sol` — oracle manipulation
Lending market that reads spot reserves from a Uniswap V2 pair for collateral pricing AND for the liquidation health check. Flash-loan + sandwich → free liquidations.

**Skills triggered:** [oracle-manipulation](../skills/oracle-manipulation/SKILL.md), [flash-loan-attacks](../skills/flash-loan-attacks/SKILL.md), [lending-specialist](../agents/lending-specialist.md).

### `FlashLoanGovernance.sol` — flash-loan governance vote
Vote weight is the spot `balanceOf` — flash-borrow → vote → repay grants total voting power. Inspired by the Beanstalk hack ($182M, April 2022).

**Skills triggered:** [flash-loan-attacks](../skills/flash-loan-attacks/SKILL.md), [governance-specialist](../agents/governance-specialist.md).

### `Inflatable4626.sol` — vault donation attack
Naive ERC-4626 share math with no virtual-shares, dead-shares, or minimum-first-deposit defense. First depositor + donation → next depositor's deposit rounds to 0 shares.

**Skills triggered:** [erc4626-inflation](../skills/erc4626-inflation/SKILL.md), [yield-aggregator-specialist](../agents/yield-aggregator-specialist.md).

### `ReplayableBridge.sol` — signature replay
Signed-message bridge with no nonce, no chainId, no `verifyingContract`, and no zero-address check on `ecrecover`. Same signature replays infinitely AND across chains.

**Skills triggered:** [signature-replay](../skills/signature-replay/SKILL.md), [bridge-specialist](../agents/bridge-specialist.md), [crosschain-messaging-specialist](../agents/crosschain-messaging-specialist.md).

## What `/audit` should find

Rough expected output across all 5 contracts:

| Severity | Count |
|---:|---|
| Critical | 5–7 |
| High | 8–10 |
| Medium | 4–5 |
| Low | 3–5 |

**Grade: F** (intentionally — these are pedagogical bug museums).

## Adding more demos

Pull requests welcome. Conventions:

1. Keep each contract focused on 1–2 vuln classes (so the `/audit` output is clean and educational).
2. Add `// VULN-CLASS-NNN` comments inline so users can match AuditSentry findings to the planted bugs.
3. Update `commands/demo.md` and this README with the new entry.
4. Never include a working `receive() payable` that holds real funds — this is testbed only.
