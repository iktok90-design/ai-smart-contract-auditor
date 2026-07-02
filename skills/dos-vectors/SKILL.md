---
name: dos-vectors
description: Detect denial-of-service vectors — unbounded loops, gas griefing, push-payment chokepoints, block-stuffing exposure, revert-on-receive blocking. Activate on loops over user-controlled arrays, batch withdrawals, push-style payouts, queues, auctions with "highest-bidder" refunds, large airdrops.
---

# DoS vector detection

## When this applies

- Loops iterating over user-supplied or unbounded arrays
- Push-style payment patterns (contract pushes value to N recipients)
- Auctions that refund the previous highest bidder via direct transfer
- Mass `claim()` / `distribute()` functions
- Queues / stacks of withdrawals
- Functions whose gas cost scales with `n` users / `n` tokens
- L2 forced inclusion mechanics

## Detection patterns

### Unbounded loop over user-controlled array (CRITICAL-HIGH)
```solidity
function distribute() external {
    for (uint i; i < holders.length; ++i) {
        payable(holders[i]).transfer(rewards[i]);   // ← gas grows; eventually un-callable
    }
}
```
Worse if attacker can grow `holders` (e.g. anyone can register).

### Push-payment with revert-on-receive (HIGH)
```solidity
function refundPreviousBidder() internal {
    payable(highBidder).transfer(highBid);   // ← attacker bids from contract that reverts on receive → freezes auction
}
```
Use pull-payments: store credits, let users withdraw.

### `.transfer` (2300 gas) blocks smart-wallet receivers (MEDIUM-HIGH)
Smart wallets (Gnosis Safe, Argent) have fallback functions that need >2300 gas. Their users can't receive — effectively DoS for them.

### Gas griefing via large calldata (HIGH on relayers)
Relayer pays gas; user provides bloated calldata to grief. Cap calldata length or charge per-byte.

### `external` reentrant fee-loop DoS (HIGH)
Withdrawals from each strategy in a vault — if any strategy reverts, the entire withdraw fails. Use try/catch per strategy.

### Block-stuffing exposure (MEDIUM)
Auction ending exactly at `block.number == N` lets an attacker fill the block to prevent your bid. Use deadline windows + sniping protection (extend on late bid).

### Underflow-revert DoS on legacy 0.7.x code (MEDIUM)
Unchecked subtraction in Solidity ≥0.8 reverts on underflow — function permanently broken if state lands in that range.

### `selfdestruct` to force ether on a contract that asserts `address(this).balance == X` (HIGH)
Anyone can `selfdestruct` to your contract and break a balance-equality check. Don't rely on `address(this).balance` equality. *(Note EIP-6780 changed selfdestruct semantics — see [[selfdestruct-eip6780]].)*

### Forced inclusion on Arbitrum / Optimism (LOW-MEDIUM)
On rollups, anyone can force-include a tx via L1 — affects "exclusive sequencer" assumptions in auctions.

## Severity rubric

| Pattern | Severity |
|---|---|
| Unbounded loop attacker can grow → permanent function failure | **Critical** |
| Push-payment to attacker-controlled `receive()` blocks core flow | **High** |
| Per-strategy revert blocks entire vault withdraw | **High** |
| Smart-wallet receivers can't get `.transfer` payouts | **Medium-High** |
| Auction block-stuffing | **Medium** |
| Balance-equality reliance | **High** |
| Force-include L2 sequencer assumption | **Medium** |
| Calldata gas-grief on relayer | **Medium** |
| Bounded-but-large loop costing >block gas | **Medium** |

## Remediation patterns

- **Pull over push** — credit balances, users withdraw.
- **Per-iteration isolation** — try/catch around per-element work in batch ops.
- **Batch caps** — `require(arr.length <= MAX)`.
- **Pagination** — `distribute(start, end)`.
- **Use `call` not `transfer`** — forward all gas, then check return.
- **Don't rely on `address(this).balance` equality** — track expected balance separately.
- **Auction extensions** — extend deadline on late bid to defeat block-stuffing.

## False-positive notes

- Loops over a *contract-controlled* small bounded array (e.g. fixed 3 strategies) are fine — note the bound.
- Internal admin functions where DoS only hurts the admin → Info.

## Related

- [[unchecked-calls]]
- [[selfdestruct-eip6780]]
- [[reentrancy]]
