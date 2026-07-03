---
name: solady-safetransferlib-no-contract-check
description: Detect Solady SafeTransferLib calls that assume the token has code. SafeTransferLib.safeTransfer/safeTransferFrom/safeApprove deliberately skip the EXTCODESIZE check that OpenZeppelin's SafeERC20 performs, so a call to an EOA or a self-destructed/not-yet-deployed token address returns success with no transfer. Activate whenever code imports solady SafeTransferLib, calls safeTransfer/safeTransferFrom on a user-supplied or upgradeable token address, or routes arbitrary tokens.
---

# Solady SafeTransferLib missing-contract-check detection

## When this applies

Trigger on any of:

- `import {SafeTransferLib} from "solady/utils/SafeTransferLib.sol";`
- `SafeTransferLib.safeTransfer(token, to, amt)` / `safeTransferFrom` / `safeApprove` / `safeApproveWithRetry`
- `using SafeTransferLib for address;` followed by `token.safeTransfer(...)`
- Token address sourced from user input, a registry, a factory, or a CREATE2 prediction
- Routers, aggregators, vaults, or bridges that accept arbitrary token addresses
- Any path where the token contract could be a not-yet-deployed or self-destructed address

## Detection patterns

### Transfer to an address with no code (HIGH)
```solidity
using SafeTransferLib for address;

function rescue(address token, address to, uint256 amt) external onlyOwner {
    token.safeTransfer(to, amt);   // ← if `token` has no code, this SUCCEEDS silently
}
```
Solady's `safeTransfer` reverts only if the call itself reverts OR returns a non-truthy bool. A call to an address with no code returns success and empty returndata, which Solady treats as a passing transfer.
**Signal:** SafeTransferLib used on a token address that is never verified to contain code (`token.code.length > 0`).

### User-supplied token in accounting (HIGH)
```solidity
function deposit(address token, uint256 amt) external {
    token.safeTransferFrom(msg.sender, address(this), amt);  // no-op if token is an EOA
    shares[msg.sender][token] += amt;                         // credited anyway
}
```
Attacker passes an EOA they control as `token`; the "transfer" no-ops but `shares` is credited, minting unbacked accounting balance.
**Signal:** `safeTransferFrom` result drives state without a balance-delta check and the token address is attacker-controlled.

### CREATE2-predicted / pre-deploy token (MEDIUM-HIGH)
```solidity
address predicted = _computeAddress(salt);
predicted.safeTransfer(to, amt);   // token not deployed yet → silent success
```
**Signal:** transfer to an address computed/predicted before the contract is known to be deployed.

## Severity rubric

| Pattern | Severity | Notes |
|---|---|---|
| User-supplied token credited without balance-delta check | **High** | Mints unbacked balance / drains pool |
| safeTransfer to address with no code in fund-moving path | **High** | Funds "sent" but never move |
| Rescue/admin path only (trusted token) | **Medium** | Centralization-bounded, op error |
| Hardcoded, audited token address | **Info** | Code presence is implied constant |

## Remediation patterns

1. **Explicit code check** — `require(token.code.length != 0, "no token");` before the first transfer.
2. **Balance-delta accounting** — measure `IERC20(token).balanceOf(address(this))` before/after and credit the delta, never the requested `amount`.
3. **Token allowlist** — only accept registry-approved tokens whose code presence is established at registration.
4. **Use OZ SafeERC20** if you specifically want the built-in `isContract`/`functionCall` revert-on-no-code behavior and can afford the extra gas.

## False-positive notes

- A hardcoded immutable token address set at construction to a known deployed contract does not need a runtime code check — Info at most.
- If the same path already does `balanceOf`-delta accounting, the no-code case is caught by a zero delta — downgrade.
- `safeTransferETH` is unaffected (no token contract involved).

## Related

- [[token-compatibility]] — non-standard return values vs. missing code are distinct issues
- [[unchecked-calls]] — empty returndata treated as success
- [[centralization-risk]] — rescue paths
