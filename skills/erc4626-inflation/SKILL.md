---
name: erc4626-inflation
description: Detect ERC-4626 inflation/donation attacks — first depositor share-price manipulation, naive convertToShares math, missing virtual-shares defense. Activate on any ERC-4626 vault implementation, share/asset math, `convertToShares`, `convertToAssets`, `previewDeposit`, `previewMint`, `totalAssets`, `_decimalsOffset`.
---

# ERC-4626 inflation attack detection

## Background

The classic "donation" or "inflation" attack on share-based vaults. First depositor mints 1 wei share for 1 wei of asset → share price = 1. Attacker then donates large amount directly to the vault (bypassing deposit) → totalAssets balloons → share price massively inflated → next depositor rounds shares to 0.

Has caused real, public losses across many forks of naive ERC-4626.

## When this applies

- Any contract inheriting ERC-4626
- Custom vaults with share/asset math
- Yield aggregators
- Lending markets that mint share-tokens

## Detection patterns

### Naive convertToShares math (CRITICAL)
```solidity
function convertToShares(uint256 assets) public view returns (uint256) {
    if (totalSupply() == 0) return assets;
    return assets * totalSupply() / totalAssets();
}
```
First deposit: 1 share for 1 asset. Donation: totalAssets += 1e30. Next depositor's 1 asset → `1 * 1 / 1e30 = 0` shares. Funds lost.

### No virtual-shares defense (HIGH)
Defense: OZ ERC4626 v4.9+ uses `_decimalsOffset()` to mint "virtual" shares:
```solidity
function _convertToShares(uint256 assets, Math.Rounding rounding) internal view virtual override returns (uint256) {
    return assets.mulDiv(totalSupply() + 10 ** _decimalsOffset(), totalAssets() + 1, rounding);
}
```
This adds N virtual shares (typically 10**6 — 6 decimals offset) that nobody owns. Donations have far less leverage.

### Dead-shares pattern not used (HIGH)
Alternative defense: mint a fixed amount (e.g. 1000 shares) to `address(0)` or `address(this)` on first deposit. Locks initial donation impact.

### Minimum first deposit not enforced (MEDIUM-HIGH)
If first depositor deposits a large amount (say, 10K USDC), donation impact is bounded.

### Read-only deposit pause until seed (HIGH)
Some impls require admin to seed vault before allowing deposits. Acceptable defense; centralized but bounded.

### Asymmetric round-direction (HIGH)
ERC-4626 spec: rounding favors the vault.
- `deposit`: shares round DOWN (favor vault)
- `mint`: assets round UP (favor vault)
- `withdraw`: shares round UP (favor vault)
- `redeem`: assets round DOWN (favor vault)

Reversed direction = attacker can extract value via rounding.

### Donation accounting after rebase (HIGH)
Vaults holding rebasing tokens (stETH, etc.) — totalAssets() increases via rebase, not via internal accounting. Attack vectors similar but defenseless naive impl.

### `totalAssets()` returns `IERC20.balanceOf(address(this))` (HIGH)
Naive implementation that always sums the actual balance is the vulnerable shape. Better: track internally and rebase carefully.

## Severity rubric

| Pattern | Severity |
|---|---|
| Naive share math + no virtual shares + no dead-shares + no min-deposit | **Critical** |
| Naive math + minimum first deposit but very low | **High** |
| Asymmetric round direction (favoring depositor) | **High** |
| `totalAssets() = balanceOf(this)` with rebasing token, no defense | **High** |
| Virtual shares of 0 decimals offset on 18-decimal asset (insufficient) | **High** |
| Dead-shares but very small (e.g. 1 wei) | **High** |
| OZ ERC4626 v4.9+ with default offset (6) | **Info** *(canonical defense)* |

## Remediation patterns

- Use OZ `ERC4626Upgradeable` ≥ 4.9.0 with `_decimalsOffset() = 6` (or higher for low-decimal assets).
- OR: mint 1000+ dead shares to address(0) on first deposit.
- OR: require first deposit ≥ MIN (e.g. 1 unit of underlying).
- OR: admin-seeded vault with no public deposits until seed.
- Always validate round direction matches OZ semantics.

## False-positive notes

- A vault using OZ v4.9+ ERC4626 with explicit `_decimalsOffset` return is likely safe — verify the offset value is reasonable (6 for 18-decimal underlying is the canonical).
- Custom vaults with admin-seeded model are defenseless against admin compromise but not against external donations.

## Related

- [[flash-loan-attacks]] §inflation
- [[integer-issues]] §rounding
- [[yield-aggregator-specialist]] (subagent)
