---
title: AuditSentry Security Audit
target: examples/VulnerableVault.sol
date: 2026-05-13
commit: HEAD
chain: local
---

# AuditSentry Security Audit — VulnerableVault.sol

> Generated 2026-05-13 · commit `HEAD` · chain: local

## Executive summary

VulnerableVault is a 56-line ETH custody contract with a classic, fund-draining reentrancy in `withdraw()` that an attacker can exploit in a single transaction to drain the entire vault balance. Two privileged functions lack access control entirely — anyone can pause the contract or wipe its balance. The contract additionally ignores a low-level call return value and uses an EOA single-key admin model with sweep authority over user deposits. **This contract is not safe to deploy under any circumstance.**

| Metric | Value |
|---|---|
| Critical | **1** |
| High     | **3** |
| Medium   | 1 |
| Low      | 1 |
| Info     | 0 |
| **Grade**| **F** |

## Scope

- File: `examples/VulnerableVault.sol`
- Lines of code: 56
- Solidity: `^0.8.20`
- Compiler: `solc 0.8.24`

## Methodology

- 19 vulnerability skills auto-loaded; 5 matched.
- Specialist subagents dispatched in parallel: `attacker`, `defender`.
- Tools: AuditSentry v0.1.0, Foundry 1.5.1.
- Strict consensus mode: off.

## Trust report

The following privileged functions exist. Each represents a trust assumption.

- **`transferOwnership(address)`** — owner can rotate ownership immediately, no two-step, no zero-address check.
  - Authority: single EOA (`owner`)
  - Timelock: none
  - Risk if compromised: full contract takeover
- **`rescue(address payable)`** — owner can transfer the entire contract balance to any address.
  - Authority: single EOA (`owner`)
  - Timelock: none
  - Risk if compromised: 100% user funds drained
- **`setPaused(bool)`** — *unrestricted*. ANYONE can call.
  - Authority: anonymous
  - Timelock: none
  - Risk: griefing — adversary can flip pause state at will

## Findings

### [REENT-001 | Critical] Reentrancy drains vault via CEI violation

**Confidence:** High
**Pattern:** reentrancy (classic)
**Location:** `examples/VulnerableVault.sol:24`

**Summary**

`withdraw()` sends ether via low-level `call` *before* zeroing the user's balance. An attacker contract whose `receive()` re-enters `withdraw()` reads the un-zeroed balance, withdraws again, and repeats until the vault is empty. The bundled exploit in `test/exploits/ExploitREENT001.t.sol` deposits 1 ETH and walks away with 11 ETH (its deposit + the victim's 10 ETH).

**Code**

```solidity
function withdraw() external {
    uint256 amt = balance[msg.sender];
    require(amt > 0, "no balance");

    (bool ok,) = msg.sender.call{value: amt}("");   // ← effects pending
    require(ok, "send failed");

    balance[msg.sender] = 0;       // ← state update AFTER external call
}
```

**Impact**

Loss of 100% of user deposits, in a single transaction, with no preconditions beyond depositing ≥ 1 wei.

**Likelihood**

Trivially high. Public exploit demonstrated; ~250K gas to execute.

**Recommendation**

Apply Checks-Effects-Interactions:

```diff
 function withdraw() external {
     uint256 amt = balance[msg.sender];
     require(amt > 0, "no balance");
+    balance[msg.sender] = 0;
     (bool ok,) = msg.sender.call{value: amt}("");
     require(ok, "send failed");
-    balance[msg.sender] = 0;
 }
```

Or add `nonReentrant` from OpenZeppelin's `ReentrancyGuard`. Prefer the CEI rewrite — it's lower gas and removes the need for the lock.

**References**

- Skill: [reentrancy](../skills/reentrancy/SKILL.md)
- Working PoC: `test/exploits/ExploitREENT001.t.sol` (passes; attacker gains 11 ETH)
- Historical: dozens of incidents since The DAO (2016, $60M)

---

### [ACCESS-001 | High] `setPaused` has no access control

**Confidence:** High
**Pattern:** access-control
**Location:** `examples/VulnerableVault.sol:34`

**Summary**

`setPaused(bool)` is `external` with no modifier. Any address can flip the pause state.

**Code**

```solidity
function setPaused(bool p) external {
    paused = p;
}
```

**Impact**

Griefing — adversary can pause withdrawals indefinitely. Funds are stuck while paused (combined with the missing pause-aware code in `withdraw`, the situation is actually worse: pause is recorded but never checked, so this is purely state pollution today; if `withdraw` ever gains a `whenNotPaused` modifier in the future, this becomes a permanent DoS).

**Recommendation**

```diff
- function setPaused(bool p) external {
+ function setPaused(bool p) external onlyOwner {
     paused = p;
 }
```

Plus inherit `Ownable` (or use the existing `owner` field).

**References**

- Skill: [access-control](../skills/access-control/SKILL.md)

---

### [ACCESS-002 | High] `rescue` can drain user deposits

**Confidence:** High
**Pattern:** access-control + centralization-risk
**Location:** `examples/VulnerableVault.sol:40`

**Summary**

`rescue(address payable to)` lets `owner` transfer the contract's entire ether balance — which is *user deposits* — to any address. There is no token allowlist, no timelock, no per-call cap, and no two-step. A single-key compromise = 100% loss.

**Code**

```solidity
function rescue(address payable to) external {
    require(msg.sender == owner, "not owner");
    to.transfer(address(this).balance);
}
```

**Impact**

A compromised owner key drains all user deposits. Users have no recourse.

**Recommendation**

- Remove `rescue` entirely if not load-bearing.
- If retained, scope to non-deposit assets only (e.g. accidentally-sent ERC-20s) — explicitly exclude `address(this).balance`.
- Add a Timelock on owner actions.
- Move to a multi-sig (Gnosis Safe ≥ 3-of-5).

**References**

- Skill: [centralization-risk](../skills/centralization-risk/SKILL.md)

---

### [UNCHK-001 | High] Low-level call return value ignored

**Confidence:** High
**Pattern:** unchecked-calls
**Location:** `examples/VulnerableVault.sol:46`

**Summary**

`notifyDepositor(address depositor, bytes calldata data)` invokes `depositor.call(data)` and discards the return value. Callers cannot tell whether the notification actually succeeded.

**Code**

```solidity
function notifyDepositor(address depositor, bytes calldata data) external {
    depositor.call(data);          // ← return value not checked
}
```

**Impact**

Best-effort hooks become silent failures. If callers off-chain observe successful tx-level execution, they'll wrongly assume the notification reached the depositor. Gas can also be siphoned via this best-effort path (calling expensive contracts at no risk to the caller).

**Recommendation**

```diff
- depositor.call(data);
+ (bool ok,) = depositor.call(data);
+ require(ok, "notify failed");
```

Or, if best-effort is intentional, return a status code rather than silently succeeding.

**References**

- Skill: [unchecked-calls](../skills/unchecked-calls/SKILL.md)

---

### [CENT-001 | Medium] Single-EOA owner with no two-step transfer

**Confidence:** High
**Pattern:** centralization-risk
**Location:** `examples/VulnerableVault.sol:50`

**Summary**

`transferOwnership(address newOwner)` sets `owner = newOwner` immediately. If the admin transfers to a wrong/unowned address (typo, hardware wallet bug), the contract is permanently bricked under a key the admin can't access.

**Recommendation**

Use OZ `Ownable2Step`:

```solidity
contract VulnerableVault is Ownable2Step {
    constructor() Ownable(msg.sender) {}
    // ... rest of contract
}
```

This requires the new owner to call `acceptOwnership()` to confirm.

**References**

- Skill: [centralization-risk](../skills/centralization-risk/SKILL.md)

---

### [PRAGMA-001 | Low] Floating pragma `^0.8.20`

**Confidence:** High
**Pattern:** pragma-and-addresses
**Location:** `examples/VulnerableVault.sol:2`

**Summary**

`pragma solidity ^0.8.20;` floats to any 0.8.x patch release. Production deployments should pin the exact compiler used during audit.

**Recommendation**

`pragma solidity 0.8.24;`

---

## Out of scope / limitations

- ETH deposit accounting only; no ERC-20 paths exist.
- No fork-state validation (this is a local file, not a deployment).

## Appendix

- Tool: AuditSentry v0.1.0
- PoC: `test/exploits/ExploitREENT001.t.sol` — passes (attacker drains 11 ETH)
- Findings JSON: `samples/audit-vulnerable-vault.json`

> Generated by AuditSentry — https://iktok90-design.github.io/AuditSentry
