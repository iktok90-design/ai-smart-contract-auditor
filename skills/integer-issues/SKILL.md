---
name: integer-issues
description: Detect integer over/underflow in `unchecked` blocks, downcasting losses, fixed-point precision errors, division-before-multiplication, signed/unsigned mixing. Activate on any arithmetic in `unchecked { }`, `SafeCast`, `uintN(uintM(x))` casts, division and modulo, percentage/basis-points math, AMM share/asset math.
---

# Integer issues detection

## When this applies

- `unchecked { … }` blocks (Solidity ≥0.8)
- Downcasts: `uint128(x)`, `int256(uint256(x))`, `uint8(...)`
- Division and modulo
- Fixed-point math with custom decimal scales
- Share/asset math in vaults, lending, AMMs
- Pre-0.8 Solidity code (no built-in overflow checks)
- Vyper code with unbounded loops
- Inline assembly arithmetic

## Detection patterns

### Unchecked overflow on user input (HIGH)
```solidity
unchecked {
    balance[to] += amount;        // ← if amount controlled, can overflow back to 0
}
```
`unchecked` is fine for proven-safe accumulators (e.g. `++i` in bounded loops), not for value math.

### Division before multiplication (HIGH)
```solidity
uint256 fee = (amount / 100) * feeBps;   // ← truncation; do (amount * feeBps) / 100
```

### Decimal mismatch (HIGH)
USDC = 6 decimals, WETH = 18, WBTC = 8. Mixing without scaling produces silent 1e10–1e12 errors.
```solidity
uint256 wethValue = amountUsdc * price;   // ← USDC 6dp × price 8dp = 14dp, need 18dp
```

### Downcast loss (HIGH)
```solidity
uint128 sharesU128 = uint128(shares);   // ← silently truncates if shares > 2^128
```
Use OZ `SafeCast`.

### Fixed-point precision loss (HIGH)
Compounding interest done as `principal * (1 + rate)^t` with too-few-decimal `rate`. Use ray (1e27) or wad (1e18) math via PRBMath / Solady.

### Round-direction asymmetry (HIGH for vaults)
ERC-4626 must round shares *down* on deposit (favor vault) and *up* on withdraw (favor vault). Reversed direction = donations-style drain. Use OZ `Math.mulDiv(_, _, _, Rounding.Down/Up)`.

### Signed/unsigned mixing (HIGH)
```solidity
int256 delta = int256(a) - int256(b);   // a or b might be > 2^255, becomes negative silently
```

### Modulo zero (revert, but…) (MEDIUM-HIGH if attacker can set divisor=0)

### Block-time math on L2 (MEDIUM)
`block.timestamp` granularity differs (2s on Optimism, 250ms on Arbitrum). Slot-based deadlines can be off.

### Sqrt / log integer approximations (MEDIUM)
Custom `sqrt` implementations are notorious. Use Solady/PRBMath.

### Percentage in basis points without bounds (LOW)
`fee_bps` should be capped (`fee_bps <= 10_000`).

## Severity rubric

| Pattern | Severity |
|---|---|
| Unchecked overflow on user input | **High** |
| ERC-4626 round-direction wrong | **High** |
| Decimal-mismatch in price/balance math | **High** |
| Downcast losing high bits silently | **High** |
| Division before multiplication on financial-critical path | **High** |
| Custom sqrt/log without overflow proof | **Medium** |
| Bps fee with no cap | **Low** |
| Loop index underflow in pre-0.8 code | **High** |
| Modulo-zero on attacker-controlled divisor | **High** |

## Remediation patterns

- Solidity 0.8.x default checks; only `unchecked` proven-safe (e.g. `++i` in `for` loops bounded by array length).
- OZ `SafeCast` for downcasts.
- `Math.mulDiv` (OZ) for multiply-then-divide without intermediate overflow.
- PRBMath or Solady for fixed-point exp/log/pow.
- Always scale to a common decimal base before doing math; document the scale.
- ERC-4626: always use `Math.mulDiv(..., Rounding.Down)` on deposits, `Rounding.Up` on withdrawals; or use OZ's `ERC4626Upgradeable` which handles this.

## False-positive notes

- `unchecked { ++i; }` in `for` loops with `i < arr.length` is the canonical safe use — not a finding.
- Pre-0.8 SafeMath is fine; the issue is mixed-version dependencies.

## Related

- [[token-compatibility]] — decimals confusion
- [[oracle-manipulation]] — price scaling
- [[yield-aggregator-specialist]] — ERC-4626 round direction
