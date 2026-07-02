---
name: restaking-eigenlayer
description: Detect restaking / AVS bugs — EigenLayer / Symbiotic / Karak operator slashing edge cases, withdrawal-queue gaming, cascading-slashing across AVSs, LST depeg solvency, AVS opt-in granularity. Activate on EigenLayer / Symbiotic / Karak imports, StrategyManager, DelegationManager, EigenPod, AVS registration, slasher contracts.
---

# Restaking / EigenLayer detection

## When this applies

- AVS implementations using EigenLayer / Symbiotic / Karak / Babylon
- Restaking deposit / withdrawal contracts
- Operator-management contracts
- LST-restaking integrations

## Detection patterns

### Withdrawal queue gaming (HIGH)
User queues withdrawal, performs slashable action, unqueues if slashing didn't hit. Defense: slashing must apply to in-flight withdrawals too.

### Cascading slashing across AVSs (HIGH)
One operator opts into many AVSs. A slash by AVS-A reduces stake → AVS-B's quorum requirement may not be met. Solvency check before slashing.

### AVS opt-in without delegator consent (HIGH)
Operator opts into a new AVS, exposing delegators to its slashing conditions without notice. Required: opt-in announcement + delegator-side withdrawal window.

### Slashing magnitude unbounded (CRITICAL)
Bad AVS spec slashes 100% on a single condition. With multiple AVSs sharing operator, this can drain the operator's restakers entirely. Cap per-slash magnitude.

### Off-chain slashable evidence verifiability (HIGH)
Slashable conditions claim cryptographic provability. If proof is forgeable or the verifier has a bug, false slashing possible.

### EigenLayer strategy-manager + delegation-manager interaction (HIGH)
Strategy positions and delegation are separate. Race conditions between staking, delegating, and withdrawing. Off-by-one in undelegation queue can lock funds.

### EigenPod verifyWithdrawalCredentials (HIGH)
Beacon-chain withdrawal credentials must match EigenPod address. Mismatch → funds locked.

### Operator commission update timing (MEDIUM-HIGH)
Operator can update commission instantly → flash-claim rewards at higher rate. Required: delay on commission updates.

### LST depeg solvency (HIGH)
Restaking accepts LSTs at face value. LST depeg → restaking is undercollateralized. Required: solvency check or repricing.

### Symbiotic vault FullRestake vs NetworkRestake confusion (HIGH)
Different vault delegator types have different slashing semantics. Misconfiguration → slashing applies to wrong stakers.

### Karak DSS registration auth (HIGH)
DSS (Distributed Secured Service) registration without operator-consent check.

### AVS slasher centralization (HIGH)
Slashing authority is a single EOA → can falsely slash. Required: timelock + multi-sig on slasher.

### Pre-slash withdrawal griefing (MEDIUM)
Operator queues large withdrawal just before a slashable event → effective slash magnitude reduced. Required: pre-slash freeze.

## Severity rubric

| Pattern | Severity |
|---|---|
| Slashing magnitude uncapped → drainable | **Critical** |
| Slasher centralization (single EOA, no timelock) | **High** |
| Cascading-slash insolvency on cross-AVS | **High** |
| Operator opt-in without delegator notice/window | **High** |
| Forgeable off-chain evidence in slashing | **High** |
| Withdrawal-queue gaming | **High** |
| LST depeg solvency unaccounted | **High** |
| Commission update with no delay | **Medium-High** |
| Pre-slash withdrawal grief | **Medium** |

## Remediation patterns

- Slashing caps: per epoch, per asset, per AVS.
- Delegator opt-out window when operator joins new AVS.
- Solvency check: total restaked value ≥ outstanding obligations at oracle price.
- Slasher gated by timelock + multi-sig.
- LST repricing or wrapped-LST (wstETH-style) to avoid rebase confusion.
- Commission update delay (≥ 1 epoch).
- Pre-slash freeze on withdrawal queue.

## False-positive notes

- Canonical EigenLayer / Symbiotic contracts are audited — focus on app-side integration.
- AVS implementations may legitimately have aggressive slashing for security guarantees; verify the spec was followed.

## Related

- [[restaking-specialist]] (subagent)
- [[oracle-manipulation]] (LST pricing)
- [[centralization-risk]]
