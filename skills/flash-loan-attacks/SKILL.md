---
name: flash-loan-attacks
description: Detect vulnerability to flash-loan-funded attacks — governance manipulation, price manipulation, collateral inflation, vault donation attacks. Activate when reviewing AMMs, lending protocols, governors, ERC-4626 vaults, staking with voting power, or any system whose state depends on its own balance.
---

# Flash-loan attack detection

## When this applies

- AMMs, lending markets, ERC-4626 vaults, staking with voting power
- Governance using `getVotes` or `balanceOf` at the moment of vote-casting
- Liquidations / collateral health checks that use spot price
- Reward distributions proportional to balance held at a snapshot
- Any protocol whose state depends on its own `address(this).balance` or token balance

## Detection patterns

### Governance flash-loan voting (CRITICAL)
```solidity
function castVote(uint256 propId) external {
    uint256 power = token.balanceOf(msg.sender);   // ← spot balance
    proposals[propId].votes += power;
}
```
Fix: snapshot at `proposalCreated` via `ERC20Votes` checkpoints + sufficient voting delay.

### Vault donation / inflation attack (CRITICAL on ERC-4626)
First depositor mints 1 share, attacker sends huge `transfer` directly to vault → share price inflates → subsequent depositor's small deposit rounds to 0 shares.
```solidity
// vulnerable mint math
shares = assets * totalSupply / totalAssets;   // ← totalAssets manipulable by direct transfer
```
Fix: virtual shares + virtual assets (OpenZeppelin v4.9+ ERC4626), or dead-shares pattern, or minimum first deposit.

### Spot-price collateral check (CRITICAL)
```solidity
function isHealthy(address user) public view returns (bool) {
    uint256 collateralValue = oracle.spotPrice() * collat[user];   // ← spot
    return collateralValue >= debt[user] * MIN_RATIO;
}
```
Flash-loan moves spot → temporarily unhealthy → liquidator (attacker) takes collateral at discount. See [[oracle-manipulation]].

### Staking rewards via instantaneous balance (HIGH)
Snapshot-less reward math that integrates `balanceOf` at unpredictable moments.

### Lending utilization-rate manipulation (HIGH)
Borrow rate as a function of `utilization = borrowed / supplied`. Flash-deposit → instantaneous low utilization → favorable borrow → flash-repay.

### Single-block circular flash-loan abuse
Take flash loan from A, deposit into B, manipulate B's price/rate, borrow from C, repay A — all in one block. Detect via: "this contract takes external balance into account in a single function."

### Bribe / token-distribution gaming
Flash-loan governance token to claim bribes that are paid pro-rata to current holders.

## Severity rubric

| Pattern | Severity |
|---|---|
| Governance vote weight from spot balance | **Critical** |
| ERC-4626 vault with no inflation protection | **Critical** |
| Liquidation health check using spot price | **Critical** |
| Bonding-curve / mint price tied to spot | **Critical** |
| Reward distribution proportional to spot balance, claim is permissionless | **High** |
| Utilization-rate function exploitable in single block | **High** |
| Bribe market with spot-balance pro-rata distribution | **High** |
| Display-only metric tied to spot balance | **Info** |

## Remediation patterns

- **Snapshot vote weight** at proposal creation. Enforce `votingDelay > 0` (typically 1 day).
- **ERC-4626 inflation guards**: OZ virtual shares/assets, or "dead-shares" (mint 1000 shares to address(0) on first deposit), or require minimum first-deposit amount.
- **TWAP + multi-oracle** pricing on health checks and liquidations (≥30 min window).
- **Per-block accounting limits** — no state should depend on within-block deltas that can be flash-loan-funded.
- **Lockup periods** — claim rewards only N blocks after deposit.
- **Cooldown on key actions** — e.g. governance can't vote in the block balance was acquired.

## False-positive notes

- Internal-only functions or functions guarded by trusted roles aren't flash-loan exploitable unless the trusted role is compromised — note but down-severity.
- Protocols using `ERC20Votes` with proper checkpoints + `votingDelay` are typically safe — verify the delay value.

## Related

- [[oracle-manipulation]] — flash loans almost always pair with oracle manipulation
- [[governance-specialist]] — protocol-specific governance review
- [[yield-aggregator-specialist]] — ERC-4626 deep-dive
