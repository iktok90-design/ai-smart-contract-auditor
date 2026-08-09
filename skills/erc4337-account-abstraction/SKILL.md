---
name: erc4337-account-abstraction
description: Detect ERC-4337 account-abstraction bugs — validateUserOp storage-rule violations, paymaster postOp DoS, session-key scope bypasses, signature aggregation issues, EIP-7702 delegation risks. Activate on `validateUserOp`, `validatePaymasterUserOp`, `postOp`, `UserOperation`, `EntryPoint`, `IAccount`, `IPaymaster`, session-key modules, ERC-7579 modules, EIP-7702 authorization payloads.
---

# ERC-4337 / Account Abstraction detection

## When this applies

- Smart-wallet implementations (SimpleAccount, Safe-AA, Kernel, Biconomy, Light Account, custom)
- Paymaster contracts (verifying, deposit, token-paying, sponsorship)
- Module systems (ERC-7579, ERC-6900) and session-key managers
- Bundler / mempool-side relayer logic (rare in app code, but watch for)
- EIP-7702 delegated EOAs

## Detection patterns

### `validateUserOp` storage-rule violation (HIGH)
ERC-4337 §6 forbids `SLOAD` on storage slots outside the wallet's own contract during validation. Bundlers reject non-compliant UserOps. Beyond compliance, accessing external state during validate is a *banner attack surface* (e.g. reading from an attacker-controlled contract).
```solidity
function validateUserOp(...) external returns (uint256) {
    uint256 x = IExternal(0xabc).read();   // ← violates storage rules + leaks attack surface
    ...
}
```

### Missing `msg.sender == entryPoint()` check (CRITICAL)
```solidity
function validateUserOp(...) external returns (uint256) {
    // ← anyone can call directly, bypass bundler entirely
}
```

### Paymaster `postOp` revert risk (HIGH)
```solidity
function postOp(PostOpMode mode, bytes calldata ctx, uint256 actualGasCost) external {
    require(...);   // ← if this reverts in postOp, bundler is griefed; reputation system penalizes the paymaster
}
```
`postOp` should be revert-free. Use try/catch or never revert.

### Paymaster oracle manipulation for token-paying (HIGH)
Token-paying paymaster converts ERC20 → ETH at validate time. If oracle is spot AMM, sandwichable. See [[oracle-manipulation]].

### Sponsorship-paymaster missing nonce/deadline (HIGH)
Sponsorship sig replayable. See [[signature-replay]].

### Session-key scope bypass (HIGH)
Session keys grant limited authority (allowed selectors, allowed targets, time bounds). Bypass paths:
- Multicall router that the session key approves → key calls arbitrary fns via the router
- Fallback function not scoped
- ERC-7579 module installation while session-key active
- Approval to swap router → token-drain via the approval

### EIP-7702 chainId-less authorization (CRITICAL)
EIP-7702 delegations replayable across chains if `chainId == 0` or missing chainId binding.

### EIP-7702 delegation to attacker (CRITICAL)
User signs an authorization to a contract address. If that contract is upgradeable / attacker-controlled, the EOA's nonce-aware delegated-call grants full control.

### Aggregated sig replay (HIGH)
BLS-aggregated UserOps with `aggregator` field — if aggregator's verifier doesn't include chainId, cross-chain replay possible.

### Nonce-key collision (MEDIUM)
ERC-4337 uses 192-bit "nonce-key" for parallel UserOps. If multiple session keys / dapps share key 0, they serialize unnecessarily. Worse: if key encoding collides with another semantic, a stuck UserOp can DoS.

### Permit2 + AA collision (MEDIUM)
Meta-tx with permit can collide on nonces with regular UserOp.

### Module install with missing auth check (CRITICAL)
ERC-7579 / ERC-6900 module install paths sometimes lack `onlyEntryPointOrOwner`. Install path → arbitrary module → arbitrary execution.

## Severity rubric

| Pattern | Severity |
|---|---|
| `validateUserOp` callable by non-EntryPoint | **Critical** |
| Module install lacks auth check | **Critical** |
| EIP-7702 missing chainId in authorization | **Critical** |
| EIP-7702 delegation to mutable contract | **Critical** |
| Paymaster postOp can revert | **High** |
| Session-key scope bypass via multicall/fallback | **High** |
| Storage-rule violation in validate | **High** |
| Token-paymaster spot-oracle dependency | **High** |
| Sponsorship-paymaster sig without nonce/deadline | **High** |
| Aggregated sig missing chainId | **High** |
| Nonce-key naming collision | **Medium** |

## Remediation patterns

- Wallet: `require(msg.sender == address(entryPoint()), "only EP");`.
- Paymaster: never revert in postOp; use try/catch internally.
- Module install: gate behind `onlyEntryPointOrOwner` and a per-module validation step.
- Session keys: explicit allowlist of (selector, target) tuples; no fallback fallthrough.
- EIP-7702: include chainId in EIP-7702 authorization payload; delegate only to immutable, audited code.
- Storage rules: only `SLOAD` from self during validate; cache external state into self-state before validate.

## False-positive notes

- Canonical SimpleAccount-style impls from eth-infinitism are reference; safe.
- "Account Factory" pre-deployment patterns sometimes look risky but are well-understood.

## Related

- [[signature-replay]]
- [[delegatecall-risks]]
- [[aa-specialist]] (subagent)
