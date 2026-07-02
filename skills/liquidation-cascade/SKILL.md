---
name: liquidation-cascade
description: Detect cascading liquidations and socialized bad debt — correlated collateral (multiple LSTs/stables), bad debt socialized across unrelated markets, oracle flash-crash triggering mass liquidation, insurance-fund depletion ordering, liquidation incentives too low to clear bad debt, and depeg cascades. Activate whenever a lending/perp/CDP protocol liquidates positions, prices collateral, or has shared-risk pools.
---

# Liquidation cascade detection

## When this applies

Trigger on any of:

- Lending / CDP / perp markets with liquidation and a liquidation bonus
- Multiple collateral assets that are correlated (stETH/rETH/cbETH, USDC/DAI/USDT)
- A single insurance fund or backstop covering many isolated or pooled markets
- Bad-debt handling that socializes losses across lenders/LPs
- Collateral priced from a feed that can flash-crash or depeg
- Liquidation incentives or close factors set by governance

## Detection patterns

### Correlated collateral, no concentration cap (HIGH)
```solidity
// stETH, rETH, cbETH all accepted, all priced off ETH-correlated feeds
collateralFactor[stETH] = 0.9e18;
collateralFactor[rETH]  = 0.9e18;
```
**Signal:** treating correlated LSTs as independent diversification. A single LST depeg (stETH 2022, or an LRT slashing event) crashes many positions at once, overwhelming liquidation throughput. Cap aggregate exposure per risk-cluster, not per token.

### Bad debt socialized across markets (HIGH)
A loss in one risky isolated market draining a *shared* insurance fund or pool that also backs blue-chip markets. **Signal:** one toxic listing can impair unrelated depositors (the Mango / cross-margin contagion class). Isolate bad debt to the originating market.

### Oracle flash-crash mass liquidation (HIGH)
```solidity
uint256 price = oracle.getPrice(collateral);   // single-block spot, no bounds
if (debt > price * collateral * cf) liquidate();
```
**Signal:** a momentary depeg / wick (or manipulated feed) marks thousands of healthy positions liquidatable in one block; liquidators race, price gaps, and survivors eat bad debt. Use TWAP / deviation circuit breakers before liquidating en masse.

### Liquidation incentive too low → stuck bad debt (MEDIUM)
If the liquidation bonus < gas + slippage to unwind seized collateral, liquidators don't act; positions go underwater and bad debt accrues silently. **Signal:** fixed small bonus on illiquid or volatile collateral.

### Insurance-fund depletion ordering (MEDIUM / HIGH)
Order of loss absorption matters: if the fund pays liquidator bonuses *before* covering bad debt, or if multiple markets draw from it without priority, a run drains it. Define and bound the waterfall.

### Depeg cascade (HIGH)
Stablecoin-collateralized debt where the stable depegs: liquidations sell the depegging asset, deepening the depeg, triggering more liquidations (UST May 2022). Flag self-reinforcing sell pressure with no circuit breaker.

## Severity rubric

| Pattern | Severity | Notes |
|---|---|---|
| Toxic-market bad debt socialized to all depositors | **High** | Cross-market contagion |
| Correlated collateral, no cluster cap | **High** | Simultaneous mass insolvency |
| Spot-oracle flash-crash mass liquidation | **High** | One-block cascade |
| Self-reinforcing depeg cascade | **High** | No circuit breaker |
| Insurance-fund waterfall ordering flaw | **Medium** | Run-depletable |
| Liquidation bonus too low → stuck bad debt | **Medium** | Slow accrual |

## Remediation patterns

1. **Isolate bad debt** per market (Compound III / Morpho-style isolation, Aave isolation mode + debt ceilings); never let a risky listing impair blue-chip depositors.
2. **Risk-cluster caps** — bound aggregate exposure to correlated assets (all LSTs as one bucket), not per-token.
3. **Circuit breakers** — pause liquidations on excessive deviation; use TWAP/median so a single wick can't mass-liquidate.
4. **Right-size liquidation incentives** to gas + realistic unwind slippage on the *actual* collateral liquidity.
5. **Define the loss waterfall explicitly** (insurance fund → socialization → governance backstop) with per-market accounting.

## False-positive notes

- A protocol with hard per-market debt ceilings and isolated collateral already bounds contagion; note rather than escalate.
- Single-collateral, deeply-liquid markets (e.g. WETH-only) carry low cascade risk.
- A bonus that looks low but on a highly liquid asset may still clear — judge against real unwind cost.

## Related

- [[oracle-redundancy]] — flash-crash protection and staleness gating
- [[oracle-manipulation]] — manipulated marks trigger false liquidations
- [[centralization-risk]] — governance-set risk params and pause keys
