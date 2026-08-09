---
name: access-control
description: Detect missing or incorrect access control — missing modifiers, wrong role checks, privileged function exposure, public initializers, and role-escalation paths. Activate on any function that mutates state, transfers funds, mints tokens, sets admin parameters, upgrades implementations, or pauses/unpauses.
---

# Access control detection

## When this applies

Any state-mutating function. In particular:

- Functions modifying balances, totalSupply, allowances, prices, fees
- `setOwner`, `transferOwnership`, `grantRole`, `setAdmin`, `setMinter`
- Upgrade pathways: `upgradeTo`, `_authorizeUpgrade`, proxy admins
- Pause/unpause, emergency-withdraw, sweep, recoverERC20
- Initializers (`initialize`, `__Init`, `_init`)
- Functions guarded only by `msg.sender == tx.origin` or address checks against a single static value
- Bridges, governors, vaults, anything with treasury

## Detection patterns

### Missing modifier (CRITICAL)
```solidity
function mint(address to, uint256 amount) external {
    _mint(to, amount);   // ← anyone can mint
}
```

### Wrong role check (HIGH)
```solidity
function setFee(uint256 fee) external {
    require(msg.sender == owner || hasRole(USER, msg.sender));   // ← USER role can set fee
    fee_ = fee;
}
```

### Initializer left public (CRITICAL)
```solidity
function initialize(address admin) public {     // ← no initializer guard, anyone can re-init
    _grantRole(DEFAULT_ADMIN_ROLE, admin);
}
```
**See also:** [[initialization]]

### tx.origin auth (HIGH)
```solidity
require(tx.origin == owner);   // ← phishable via intermediate contract
```

### Public privileged getter masking setter
Sometimes a setter is internal but a public wrapper exists with weak checks. Search for "alternate paths" to the same state slot.

### Role admin self-grant (HIGH)
`DEFAULT_ADMIN_ROLE` can grant itself any role. If the admin is an EOA, a single key compromises everything. Look for renounceable admin patterns or multi-sig requirements.

### `selfdestruct` reachable without ownership check (CRITICAL — but see [[selfdestruct-eip6780]])

### Sweep / recoverERC20 with no asset allowlist (MEDIUM-HIGH)
```solidity
function rescue(IERC20 token) external onlyOwner {
    token.transfer(owner, token.balanceOf(address(this)));  // ← sweeps any token incl. user deposits
}
```
Critical if it can sweep user deposits, Medium if only stuck airdrops.

## Severity rubric

| Pattern | Severity |
|---|---|
| Privileged mint/burn with no auth | **Critical** |
| Public `initialize` on a deployed proxy | **Critical** |
| Owner sweep that includes user deposits | **Critical** |
| Wrong role guards a sensitive op | **High** |
| `tx.origin` auth | **High** |
| Centralized single-key admin with no timelock | **High** *(see [[centralization-risk]])* |
| Renounced ownership but admin role retained | **Medium** |
| Missing zero-address check on role grant | **Low** |

## Remediation patterns

- Use `OwnableUpgradeable` / `AccessControlUpgradeable` from OZ — never roll your own.
- For each function: state the *one* role that should call it as a comment, then add the matching modifier.
- Initializers: `_disableInitializers()` in the constructor, `initializer` modifier on init.
- Multi-sig + timelock on `DEFAULT_ADMIN_ROLE`. Document the timelock duration.
- Two-step ownership transfer (`Ownable2Step`) to prevent locking out the contract.
- For sweeps: explicit allowlist of recoverable tokens, or `denylist` user-deposit tokens.

## False-positive notes

- Internal functions called only from properly-guarded externals are fine — verify call sites.
- A function may look unguarded but its only side-effect is emitting an event — Info, not High.
- "Permissionless" by design (e.g. `claim()` for caller) is fine — verify intent against the spec.

## Related

- [[initialization]] — initializer-specific access control
- [[centralization-risk]] — admin-power audit
- [[delegatecall-risks]] — proxy upgrade authorization
