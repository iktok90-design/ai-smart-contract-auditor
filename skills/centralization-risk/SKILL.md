---
name: centralization-risk
description: Detect centralization and trust-assumption risks — admin powers, single-key risk, missing timelocks, upgrade authority, treasury keys, pause permanence, blacklisting authority, oracle authority. Activate on `onlyOwner`, `onlyRole`, `AccessControl`, upgrade authorizations, pause/unpause functions, mint/burn caps, treasury/fee setters.
---

# Centralization risk audit

## Why this matters

Centralization findings are non-exploits in the traditional sense, but they're the most common reason audits flag a protocol as "rugpullable". The protocol can be the attacker. Investors deserve a clear inventory.

## When this applies

- Every privileged function (mint, burn, set-fee, set-oracle, upgrade, pause, recover, sweep, blacklist)
- Multi-sig configuration
- Timelock configuration
- Upgrade authority (UUPS `_authorizeUpgrade`)
- Emergency-withdraw / emergency-pause
- Token mint caps + upgradability of caps

## Detection patterns

### Single-key admin (HIGH)
```solidity
contract X is Ownable {
    function upgradeTo(address impl) external onlyOwner { ... }
    function setFee(uint256 fee) external onlyOwner { ... }
    // ← one key, can pull rug
}
```
Findings:
- "Owner can upgrade implementation immediately, with no timelock or multi-sig."
- "Single key controls treasury."

### No timelock (HIGH)
`onlyOwner` upgrades / fee changes / oracle changes that take effect immediately. Add a Timelock (OZ TimelockController), document the delay.

### Pause-without-time-cap (HIGH)
`pause()` with no auto-unpause. Owner can permanently freeze user funds.

### Mint without cap (HIGH)
```solidity
function mint(address to, uint256 amt) external onlyMinter { _mint(to, amt); }   // ← no cap, inflation risk
```

### Blacklist without on-chain criteria (HIGH)
A `blacklist(address)` function with no public criteria = "the protocol's discretion to freeze you".

### Oracle controlled by single admin (HIGH)
```solidity
function setOracle(address o) external onlyOwner { oracle = IOracle(o); }
```
Admin → switches to malicious oracle → liquidates everyone.

### Sweep-any-token without allowlist (HIGH — also in [[access-control]])
`recoverERC20(token)` that can sweep user deposits.

### Upgrade authority over user funds, no exit window (HIGH)
Users should have a window after upgrade announcement to withdraw if they disagree. Without it, governance can rug by upgrade.

### "Renounced ownership" theater (HIGH)
Ownable renounced but `DEFAULT_ADMIN_ROLE` retained. Or admin role transferred to a smart contract that has its own backdoor.

### EOA multisig threshold of 1 (HIGH)
Marketed as "multi-sig" but `threshold == 1` defeats the purpose.

### Validator / sequencer centralization (HIGH for bridges, L2s)
Single sequencer / centralized validator set. Document for bridges + L2 deployments.

### Treasury without time-locked spend (HIGH)
Owner can drain treasury immediately.

### `selfdestruct` reachable by admin (MEDIUM-HIGH)
See [[selfdestruct-eip6780]].

## Severity rubric

| Pattern | Severity |
|---|---|
| EOA controls upgrade + treasury + oracle | **Critical** *(for trust report)* |
| Pause with no auto-unpause | **High** |
| Mint with no cap | **High** |
| Unrestricted blacklist | **High** |
| No timelock on key params | **High** |
| Sweep includes user deposits | **High** |
| Multisig threshold = 1 | **High** |
| Renounce + retained admin role | **High** |
| Timelock < 24h on high-impact ops | **Medium** |
| Single-sequencer L2 | **Medium-Info** *(contextual)* |

## Output format

Centralization findings should produce a **"Trust report"** section in `/report`:

> **Admin powers:**
> - `setOracle` — can replace price oracle → drain liquidations (no timelock).
> - `upgradeTo` — can swap implementation (UUPS, no timelock).
> - `recoverERC20` — can sweep any token, including user deposits.
> - `pause` — can freeze withdrawals indefinitely (no auto-unpause).
> - `setFee` — can set fee to 100% (no cap).
>
> **Mitigations in place:**
> - Owner is a Gnosis Safe at `0x…` with 3/5 threshold.
> - 24h Timelock at `0x…` mediates `setOracle` and `upgradeTo`.
>
> **Trust assumption:** Users must trust the multi-sig signers and the 24h timelock window.

## Remediation patterns

- Multi-sig (3+ of N) for admin role.
- Timelock (≥48h for upgrades, ≥24h for params).
- Per-function caps on what admin can change (fee ≤ 5%, mint ≤ 10% of supply).
- Auto-unpause after N hours.
- Withdraw-only mode on pause.
- Public "trust assumptions" doc — every admin function listed.

## False-positive notes

- A pre-launch protocol with single admin pending timelock setup is normal — flag with recommendation, not critical.
- Test networks / staging contracts are fine to centralize.

## Related

- [[access-control]]
- [[initialization]]
- [[delegatecall-risks]]
