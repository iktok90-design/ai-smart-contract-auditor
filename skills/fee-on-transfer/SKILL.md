---
name: fee-on-transfer
description: Detect fee-on-transfer / deflationary / rebasing token accounting bugs — crediting the *passed amount* instead of the measured balance delta. Activate whenever code calls transfer/transferFrom and then credits, mints shares for, or records the literal amount argument, in deposits, AMM swaps, lending collateral, vaults, staking, or bridges — without measuring balanceAfter - balanceBefore.
---

# Fee-on-transfer token accounting detection

## When this applies

Trigger on any of:

- Deposit/stake/`addLiquidity` that records the `amount` argument after `transferFrom`
- Vault/ERC-4626 `deposit` minting shares proportional to the requested assets, not received
- AMM/router updating reserves with the input amount rather than actual receipt
- Lending protocols crediting collateral by passed amount
- Bridges locking/burning `amount` then minting the same amount on the far side
- Any flow assuming `received == amount` for arbitrary ERC-20s

## Detection patterns

### Credit passed amount, not delta (HIGH)
```solidity
function deposit(uint256 amount) external {
    token.transferFrom(msg.sender, address(this), amount);
    balanceOf[msg.sender] += amount;          // ← amount, but FoT token delivered less
    totalDeposited        += amount;
}
```
**Signal:** the contract believes it holds more than it does. On a fee-on-transfer token (USDT with fee switch enabled, PAXG, many meme tokens), `totalDeposited` exceeds the real balance — last withdrawers are insolvent, or an attacker mints excess shares/LP.

### AMM reserve desync (HIGH)
Router records input `amountIn` into reserves but the pair received `amountIn - fee`. `k` invariant is computed on phantom reserves, mispricing the swap and letting an attacker drain the shortfall over time (the Uniswap-V2-style "supports FoT" `*SupportingFeeOnTransferTokens` functions exist precisely because of this).

### Rebasing double-count (MEDIUM / HIGH)
```solidity
uint256 shares = amount * totalShares / totalAssets;   // totalAssets from stored var
```
**Signal:** stored `totalAssets` vs live `token.balanceOf(this)` diverge as a positive-rebasing token (stETH, aTokens, OHM) grows. Crediting against the stale stored figure under- or over-mints shares; an attacker times deposits around rebase.

### Bridge mint mismatch (CRITICAL)
Lock `amount` on chain A, emit message, mint `amount` on chain B — but only `amount - fee` was locked. Repeated deposits accumulate an unbacked mint surplus that can be withdrawn on A by honest users, draining the lockbox.

## Severity rubric

| Pattern | Severity | Notes |
|---|---|---|
| Bridge mints unbacked surplus | **Critical** | Cross-chain insolvency |
| Vault/LP shares minted on phantom amount | **High** | Direct over-mint, fund loss |
| AMM reserve recorded as passed amount | **High** | Mispricing, drainable shortfall |
| Lending collateral over-credited | **High** | Under-collateralized borrow |
| Rebasing stored-vs-live `totalAssets` drift | **Medium** | Timing-dependent |
| FoT token on a hard whitelist of non-FoT tokens | **Info** | Surface closed by policy |

## Remediation patterns

1. **Measure the delta:** `uint256 before = token.balanceOf(address(this)); token.transferFrom(...); uint256 received = token.balanceOf(address(this)) - before;` and credit `received`.
2. **Reject FoT on entry** — if `received != amount`, revert (OpenZeppelin `SafeERC20` does not do this for you).
3. **Use live balance, not stored totals**, for rebasing tokens, or wrap them (wstETH) so balances are non-rebasing.
4. **Token allowlist** for assets known not to take a transfer fee; document the assumption.
5. **On bridges**, lock the *measured* received amount and mint exactly that.

## False-positive notes

- A protocol that only ever handles a fixed, audited, non-FoT token (e.g. a WETH-only vault) is safe — note the assumption rather than flagging High.
- `*SupportingFeeOnTransferTokens` router variants already measure deltas — don't flag.
- Read-only quoting that never credits balances is unaffected.

## Related

- [[token-compatibility]] — broader weird-ERC20 behaviors (no return value, blocklists)
- [[erc4626-inflation]] — share-mint math interacts with miscounted assets
- [[cross-chain-messaging]] — bridge mint/lock mismatch surface
