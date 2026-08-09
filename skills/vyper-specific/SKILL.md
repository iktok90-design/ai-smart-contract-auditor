---
name: vyper-specific
description: Detect Vyper-specific bug classes — compiler-version reentrancy bugs, raw_call return-value handling, send/raw_call gas defaults, immutables vs constants, default-bytes scope, msg.sender-based auth corner cases. Activate on any `.vy` file or `pragma version` directive.
---

# Vyper-specific detection

## Why a separate skill

Vyper has different defaults than Solidity. Some patterns that are safe in Solidity are unsafe in Vyper, and vice versa. Vyper has also had compiler-level reentrancy bugs (most famously the 2023 Curve incident). Audit Vyper with Vyper-aware eyes.

## When this applies

- Any `.vy` file
- Any `# @version` pragma directive
- Any contract using `raw_call`, `send`, `selfdestruct`, `create_forwarder_to`
- LP tokens, AMM pools written in Vyper (Curve and forks)

## Detection patterns

### Compiler-version reentrancy bug (CRITICAL)

Vyper 0.2.15 / 0.2.16 / 0.3.0 had a broken `@nonreentrant` lock — the lock was per-key, but the same key was reused across functions, causing locks to fail to engage in some compositions. Caused the Curve / Vyper exploit (July 2023, ~$73M).

Action: any contract pinned to `# @version 0.2.15`, `0.2.16`, or `0.3.0` — treat reentrancy guards as **broken**. Recommend upgrade to ≥ 0.3.7 (or 0.3.10+ for ongoing support).

```vyper
# @version 0.2.15        # ← FLAG: known-broken nonreentrant
```

### `raw_call` ignores return data unless `max_outsize` set (HIGH)

```vyper
raw_call(target, b"...")    # ← return data ignored entirely
```

Default `revert_on_failure=True` will revert the calling tx on a revert, but the *return data* is silently dropped. If you need to read the return:

```vyper
ok: bool = raw_call(target, b"...", max_outsize=32, revert_on_failure=False)
```

### `send` forwards 2300 gas (HIGH on L2s)

Same problem as Solidity `transfer`. Smart-wallet recipients can't receive. On L2s with different base costs (Berachain, etc.), the 2300 gas bound is unreliable.

Use `raw_call(addr, b"", value=amount)` with explicit gas bounds.

### `default_value=` on storage (MEDIUM)

`HashMap[address, uint256]` defaults to 0 for unset keys. Vyper devs sometimes assume "exists vs not-exists" semantics that don't apply. Use a paired bool flag if existence matters.

### `selfdestruct` semantics (HIGH on pre-Cancun)

Same EIP-6780 caveats apply ([[selfdestruct-eip6780]]). Vyper code that relies on selfdestruct deleting code is broken post-Cancun on mainnet (March 2024).

### `create_forwarder_to` clones share code (HIGH)

EIP-1167 minimal-proxy clones via `create_forwarder_to`. Same gotcha as Solidity: per-clone init guard required, or anyone can initialize a fresh clone.

### Decimal scaling (MEDIUM-HIGH)

Vyper's `decimal` type is fixed-point with limited range. Mixing `uint256` and `decimal` for price math invites overflow or precision loss. Most modern Vyper code avoids `decimal`; if present, audit carefully.

### `external` vs `internal` and visibility (MEDIUM)

Vyper enforces explicit visibility (`@external`, `@internal`, `@view`, `@pure`). Functions without visibility are syntax errors — but `@external` + missing access checks are still a foot-gun (same as Solidity).

### `msg.sender == self` patterns (MEDIUM)

Vyper allows `msg.sender == self` checks — used to gate "callable only from internal call". Easy to typo `msg.sender == self.owner` vs `== self`. Check the intent.

### `assert` vs `raise` (LOW)

`assert` and `raise` both revert. `assert <cond>` reverts if false; `raise "reason"` always reverts. Mix-up on devs coming from Solidity. Both are safe; just consistency.

### Storage layout — Vyper has no `__gap` convention (HIGH for upgradeable)

Vyper isn't typically used for upgradeable contracts (no equivalent of OZ Upgradeable plugin). If you find a Vyper proxy implementation, audit storage layout very carefully — reserved slots aren't a Vyper convention.

## Severity rubric

| Pattern | Severity |
|---|---|
| Vyper 0.2.15/0.2.16/0.3.0 with `@nonreentrant` | **Critical** *(known-broken)* |
| `raw_call` to user-supplied target | **High** |
| `send` (2300 gas) to dynamic recipient on L2 | **High** |
| `selfdestruct` for state cleanup post-Cancun | **High** |
| `create_forwarder_to` without per-clone init guard | **High** |
| Decimal scaling errors in price math | **High** |
| Storage layout in Vyper proxy without explicit reservation | **High** |
| `default_value` semantics misuse | **Medium** |
| `assert` vs `raise` inconsistency | **Low** |

## Remediation patterns

- Upgrade to Vyper ≥ 0.3.10 to get fixed `@nonreentrant`.
- Use `raw_call` with explicit `max_outsize` + check return.
- Replace `send` with `raw_call(addr, b"", value=amt)` and explicit gas budget.
- Use OZ `ReentrancyGuard`-equivalent only after verifying the compiler version.
- For Curve forks specifically: pin compiler, audit the lock implementation against the Curve patch commits.

## False-positive notes

- Vyper test fixtures often use `@version 0.2.x` for legacy compatibility — verify deployment compiler differs.
- Curve LP tokens and pools have been re-audited extensively; current Curve deploys use post-fix Vyper.

## Related

- [[reentrancy]] — base reentrancy patterns
- [[selfdestruct-eip6780]] — EIP-6780 implications
- [[unchecked-calls]] — raw_call analog of low-level call
