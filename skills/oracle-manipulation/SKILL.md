---
name: oracle-manipulation
description: Detect oracle manipulation risks — spot-price reads from AMMs, stale Chainlink answers, single-source dependence, TWAP gaming. Activate whenever code reads a price, conversion rate, exchange rate, or `getReserves`, `latestAnswer`, `latestRoundData`, `consult`, `quote`, `slot0`, `observe`, `getAmountsOut`.
---

# Oracle manipulation detection

## When this applies

Any code that consumes a price feed or derives a price from on-chain state:

- Chainlink: `latestAnswer`, `latestRoundData`, `getRoundData`
- Uniswap V2: `getReserves`, `getAmountsOut`, `price0Average`
- Uniswap V3/V4: `slot0`, `observe`, `consult`
- Curve: `get_virtual_price`, `get_dy`
- Balancer: `getRate`
- Custom oracle modules, on-chain TWAPs
- LP token pricing, collateral valuation, liquidation thresholds, mint/burn rates

## Detection patterns

### Spot price from AMM (CRITICAL — funds at risk)
```solidity
(uint112 r0, uint112 r1,) = pair.getReserves();
uint256 price = r1 * 1e18 / r0;       // ← flash-loan manipulable in one block
```

### Stale Chainlink data (HIGH)
```solidity
(, int256 answer,,,) = feed.latestRoundData();   // ← ignores updatedAt and answeredInRound
```
Required checks:
- `updatedAt != 0`
- `block.timestamp - updatedAt <= heartbeat` (with chain-specific tolerance)
- `answeredInRound >= roundId`
- `answer > 0`
- Heartbeat sanity: ETH/USD is 1h on mainnet but 24h on some L2s — verify

### `latestAnswer` (deprecated, no freshness) (HIGH)
```solidity
int256 p = feed.latestAnswer();   // ← deprecated, prefer latestRoundData
```

### Single-source dependence (HIGH)
Only one oracle, no fallback, no cross-check against a second source.

### Uniswap V3 `slot0` without TWAP (CRITICAL)
```solidity
(uint160 sqrtPriceX96,,,,,,) = pool.slot0();   // ← spot, manipulable
```
Use `observe()` for TWAP with sufficient lookback (≥30min for shallow pools).

### Insufficient TWAP window (HIGH)
TWAP < 5 min on volatile assets or low-liquidity pools is gameable across two blocks.

### Read-only reentrancy on oracle (HIGH)
Reading `getVirtualPrice` / `getReserves` mid-callback — see [[reentrancy]] §Read-only.

### LP token priced via reserves directly (CRITICAL)
LP token price should use the *fair LP price* formula (Alpha Homora's method), not `reserve / totalSupply`.

### Price scaling errors (HIGH)
Chainlink answers come in feed-specific decimals; mixing ETH/USD (8 decimals) with token (18 decimals) without normalizing produces silent off-by-1e10 errors.

### Sequencer uptime ignored (HIGH on L2s)
On Arbitrum, Optimism, Base — must check `SequencerUptimeFeed` to avoid stale prices when sequencer is down.

## Severity rubric

| Pattern | Severity |
|---|---|
| Spot-price from AMM used in liquidation/mint | **Critical** |
| Uniswap V3 `slot0` used for collateral pricing | **Critical** |
| LP token priced via raw `reserve / totalSupply` | **Critical** |
| `latestRoundData` without freshness/round checks | **High** |
| Single oracle, no fallback, financial-critical path | **High** |
| Sequencer uptime check missing on L2 | **High** |
| Insufficient TWAP window (<5min on shallow pool) | **High** |
| Stale heartbeat for known-volatile asset | **High** |
| `latestAnswer` (deprecated) used | **Medium** |
| Decimal-scaling mistake | **High** |

## Remediation patterns

- For Chainlink: validate `(roundId, answer, , updatedAt, answeredInRound)` — guard against stale + zero + non-positive + round-mismatch.
- Use multiple oracles with deviation check (e.g. Chainlink + Uniswap V3 TWAP with ≥30min window).
- For LP tokens, use fair-LP-price math: `2 * sqrt(r0 * r1 * p0 * p1) / totalSupply`.
- On L2s, integrate Chainlink's `SequencerUptimeFeed` (Arbitrum, Optimism, Base).
- Avoid `slot0` and spot-price reads for anything that affects user funds.

## False-positive notes

- Display-only prices (UI/event metadata, not affecting fund flow) — Info-only.
- `getReserves` used purely for ratio diagnostics with no downstream effect — Info.

## Related

- [[flash-loan-attacks]] — most oracle attacks are funded by flash loans
- [[reentrancy]] — read-only reentrancy is an oracle-staleness issue
- [[mev-frontrunning]] — TWAP-window timing
