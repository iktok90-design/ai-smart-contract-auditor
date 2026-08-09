---
name: oracle-redundancy
description: Detect oracle fallback and redundancy failure modes (distinct from price manipulation) — single point of failure, missing staleness/heartbeat/deviation checks, an "all oracles down" path that reverts or silently returns stale/zero, missing L2 sequencer-uptime feed, and absent circuit breakers. Activate whenever code reads a price/rate feed, especially Chainlink latestRoundData, with fallbacks or on an L2.
---

# Oracle redundancy detection

## When this applies

Trigger on any of:

- `latestRoundData()` / `latestAnswer()` reads from Chainlink or any push feed
- Custom oracle aggregators with primary + fallback sources
- L2 deployments reading any price feed (Arbitrum, Optimism, Base, etc.)
- Rate/price reads that gate borrowing, liquidation, minting, or redemption
- Any "if primary fails, use secondary" branching

## Detection patterns

### Missing staleness / heartbeat check (HIGH)
```solidity
(, int256 price,,,) = feed.latestRoundData();   // ignores updatedAt & answeredInRound
require(price > 0);
return uint256(price);
```
**Signal:** no `updatedAt` freshness gate. A frozen feed (feed deprecated, node outage, or a market-wide halt) returns the last value forever; protocol prices off stale data. Require `block.timestamp - updatedAt <= heartbeat` and `answeredInRound >= roundId`.

### Single point of failure (HIGH)
One feed, no fallback, no degradation plan. If that feed is deprecated or returns garbage, the protocol is bricked or mispriced. **Signal:** a hard dependency on exactly one external address with no alternative path.

### Fallback that silently returns 0 or last price (HIGH)
```solidity
try feed.latestRoundData() returns (...) { ... }
catch { return lastGoodPrice; }   // ← stale, or worse:
catch { return 0; }               // ← 0 collateral value = mass liquidation, or free mint
```
**Signal:** the catch path masks failure. Returning `0` can make collateral worthless (mass liquidation) or debt free; returning a stale cached price keeps trading on bad data. Failures must surface, not be swallowed.

### Missing L2 sequencer-uptime feed (HIGH on L2)
```solidity
// Arbitrum/Optimism: no check of the sequencer uptime feed
(, int256 answer, uint256 startedAt,,) = sequencerUptime.latestRoundData();
require(answer == 0 && block.timestamp - startedAt > GRACE_PERIOD);
```
**Signal:** on an L2, if the sequencer was down, Chainlink prices are stale on resume. Without the uptime feed + grace period, the first post-downtime block liquidates everyone at stale prices. Chainlink documents this exact guard.

### "All oracles down" path undefined (MEDIUM)
The aggregator handles primary-down but has no defined behavior when *every* source is stale/reverting — it either reverts (DoS) or falls through to an uninitialized default. Define an explicit safe-halt (pause) rather than trade on uncertainty.

### No deviation / circuit breaker (MEDIUM)
Accepting any reported price without comparing primary vs secondary deviation, so a single compromised/erroneous feed is trusted outright.

## Severity rubric

| Pattern | Severity | Notes |
|---|---|---|
| Fallback returns 0 on failure | **High** | Mass liquidation / free mint |
| Missing staleness/heartbeat gate | **High** | Trades on frozen price |
| Single feed, no fallback | **High** | Brick / misprice on outage |
| Missing L2 sequencer-uptime check | **High** | Stale-price liquidation on resume |
| "All down" path reverts (DoS) vs safe-halt | **Medium** | Availability vs safety tradeoff |
| No primary/secondary deviation check | **Medium** | Single bad feed trusted |

## Remediation patterns

1. **Validate every read:** `updatedAt` freshness vs a per-feed heartbeat, `answeredInRound >= roundId`, `price > 0`, and a sane min/max bound.
2. **L2 sequencer-uptime feed** + `GRACE_PERIOD` before trusting prices post-downtime (Chainlink reference pattern).
3. **Real redundancy:** primary + independent secondary (e.g. Chainlink + Uniswap V3 TWAP / Pyth) with a deviation threshold; disagreement → pause, not pick-one.
4. **Fail closed:** when all sources are stale/invalid, **pause** the affected operations rather than returning 0, last price, or reverting unboundedly.
5. **Circuit breaker** on max per-block deviation to absorb wicks.

## False-positive notes

- A feed read that already checks `updatedAt`, `answeredInRound`, and bounds is fine — don't re-flag for "no fallback" if it correctly pauses on staleness.
- Mainnet-only contracts don't need the sequencer feed — don't flag its absence off-L2.
- A deliberate revert-on-stale (fail-closed) is acceptable when paired with a pause path; distinguish from an unbounded DoS.

## Related

- [[oracle-manipulation]] — manipulation is the price-correctness sibling to redundancy
- [[liquidation-cascade]] — stale/zero prices trigger mass liquidation
- [[dos-vectors]] — revert-on-all-down can become a denial of service
