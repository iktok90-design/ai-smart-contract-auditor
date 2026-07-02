---
name: reentrancy
description: Detect reentrancy vulnerabilities — classic, cross-function, and cross-contract (especially read-only reentrancy). Activate whenever Solidity/Vyper code performs external calls, low-level call/transfer/send, ERC-721 safeTransfer with a receiver hook, or any pattern where control flow leaves the contract before state finalization.
---

# Reentrancy detection

## When this applies

Trigger on any of:

- External calls via `call`, `delegatecall`, `staticcall`, `transfer`, `send`
- `safeTransferFrom` / `onERC721Received` / `onERC1155Received` callbacks
- ERC-777 `tokensReceived` / `tokensToSend` hooks
- Cross-contract calls preceding state writes
- View functions that read state which is mid-update (read-only reentrancy)
- Custom token callbacks, governance vote-cast hooks, flash-loan callbacks
- Compound/Aave-style accounting that updates user balances after external transfers

## Detection patterns

### Classic reentrancy (CRITICAL / HIGH)
```solidity
function withdraw() external {
    uint256 amt = balance[msg.sender];
    (bool ok,) = msg.sender.call{value: amt}("");   // ← external call
    require(ok);
    balance[msg.sender] = 0;                         // ← state update AFTER call
}
```
**Signal:** state mutation after external call. CEI (Checks-Effects-Interactions) violated.

### Cross-function reentrancy (HIGH)
Two functions sharing state where one calls externally and the other reads/mutates the same state. Attacker re-enters via the second function.

### Cross-contract reentrancy (HIGH)
Contract A updates state, calls B; B calls back into a *different* contract C that reads A's stale state.

### Read-only reentrancy (HIGH — frequently missed)
Victim contract reads `getReserves()` / `getPrice()` from a pool mid-callback, before the pool finalizes its state. Example: Curve pools, Balancer vaults, Uniswap V2 mid-`removeLiquidity`.
```solidity
// Pool callback hits this view function before pool state is consistent.
function priceOf(address token) external view returns (uint256) {
    return pool.getVirtualPrice();   // ← stale during reentrant call
}
```

### ERC-777 / ERC-721 hook reentrancy (HIGH)
`_safeTransfer` calls `onERC721Received` on the recipient — if recipient is a contract, it can re-enter.

## Severity rubric

| Pattern | Severity | Notes |
|---|---|---|
| Funds-draining classic reentrancy | **Critical** | Direct loss of funds, no preconditions |
| Cross-function with shared balance state | **High** | Requires specific call sequence |
| Read-only reentrancy on price/oracle read | **High** | Common pattern, often missed |
| Reentrancy gated by `onlyOwner` / trusted role | **Medium** | Centralization-bounded |
| ERC-777 hook with no state-after-call writes | **Low** | Defense-in-depth issue |
| Single-actor self-reentrancy with no value flow | **Info** |  |

## Remediation patterns

1. **CEI ordering** — effects before interactions, always.
2. **`nonReentrant` modifier** (`ReentrancyGuard` from OpenZeppelin). Add per-function.
3. **For read-only reentrancy** — guard the *view* function too, or use a separate "settled price" cache that only updates outside callbacks. Curve's solution: `withdraw_admin_fees` lock, Balancer's `ensureNotInVaultContext`.
4. **Pull over push payments** — let users withdraw rather than pushing transfers.
5. **Token whitelist** — avoid ERC-777 and rebasing tokens in untested paths.

## False-positive notes

- A function that uses `nonReentrant` from a known-good library and only calls trusted contracts is generally safe — note it but don't flag as Critical.
- `transfer` (2300 gas) blocks classic reentrancy but is brittle on L2s with higher base gas costs — flag as a *separate* issue, not as reentrancy resolved.
- Reentrancy into a function that *only reads* (no state writes downstream) and that read isn't used in a check — Info, not High.

## Related

- [[oracle-manipulation]] — read-only reentrancy often *is* an oracle issue
- [[token-compatibility]] — ERC-777 / rebasing tokens widen the attack surface
- [[delegatecall-risks]] — delegatecall through untrusted target = reentrancy + storage corruption combo
