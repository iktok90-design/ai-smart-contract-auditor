---
description: Generate Foundry invariant tests for property-based fuzzing. The high-value command for serious teams.
argument-hint: "<contract-or-file>"
allowed-tools: Read, Write, Bash, Agent, Skill, mcp__forge-runner__*
---

# /invariant — generate invariant tests

Property-based testing in Foundry. The single highest-leverage test artifact you can produce — invariants catch bugs no example-based test does.

## Procedure

### Step 1 — Identify invariants

Dispatch `invariant-writer` subagent. It reads the contract and proposes invariants based on protocol type:

**Token / ERC-20:**
- `totalSupply() == sum(balanceOf(a) for a in all_addrs)`
- balances never overflow
- transfers preserve totalSupply (no minting / burning)

**Vault / ERC-4626:**
- `totalAssets() >= sum(convertToAssets(balanceOf(a)) for a in all_holders)`
- `previewDeposit + previewWithdraw` round-trip ≤ initial value
- `totalSupply == 0 ⇒ totalAssets == 0`
- shares only mintable via `deposit/mint`, only burnable via `withdraw/redeem`

**AMM:**
- `K = reserve0 * reserve1` non-decreasing after fee-paying swaps
- LP token supply ratio matches reserves ratio over time

**Lending:**
- `sumDebt <= sumCollateralValue * MAX_LTV` (modulo bad debt)
- borrow + repay is value-preserving
- no negative balances

**Governance:**
- vote weight is snapshotted; can't be modified after proposal creation
- timelock delay always elapses before execution

### Step 2 — Generate Foundry invariant harness

```solidity
contract VaultInvariants is Test {
    Vault vault;
    Handler handler;   // ← actor that calls arbitrary fns with bounded random inputs

    function setUp() public {
        vault = new Vault();
        handler = new Handler(vault);
        targetContract(address(handler));
    }

    function invariant_TotalAssetsCoversShares() public {
        uint256 sum;
        address[] memory users = handler.getActors();
        for (uint i; i < users.length; ++i) {
            sum += vault.convertToAssets(vault.balanceOf(users[i]));
        }
        assertGe(vault.totalAssets(), sum, "vault would be insolvent");
    }
}
```

Plus a `Handler` contract that has `deposit`, `withdraw`, `transfer`, etc. — each bounded to realistic random inputs.

### Step 3 — Run and tune

Use `forge-runner` MCP:

```
mcp__forge-runner__test(test="invariant", flags="--fuzz-runs 5000")
```

If an invariant breaks, that's a finding. Reduce the failing seed to a minimal counter-example and surface as a finding.

### Step 4 — Output

```
Invariants generated for Vault:

  ✓ invariant_TotalAssetsCoversShares     5000/5000 runs
  ✓ invariant_DepositReducesAssetsBalance 5000/5000 runs
  ✗ invariant_PreviewWithdrawIsExact      4982/5000 runs

  Counter-example for invariant_PreviewWithdrawIsExact:
    seed:   0xabc...
    calls:  deposit(85), deposit(1), withdraw(86)
    actual: previewWithdraw mismatched by 1 wei (rounding)
```

The counter-example becomes a finding.

## Notes

- Invariants find bugs that example-based tests can't. Always offer this command to serious teams.
- The `Handler` is the key — bad handlers find no bugs. Make sure the handler covers all realistic state transitions.
- Run with high fuzz runs (5K-50K) for confidence.
- Pair with `/symbolic` (Halmos) for invariants that fuzzing can't reach.
