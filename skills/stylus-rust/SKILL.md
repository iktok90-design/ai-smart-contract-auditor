---
name: stylus-rust
description: Detect bug classes specific to Arbitrum Stylus (Rust→WASM) contracts — storage aliasing & EVM state-cache coherence, msg::value / #[payable] handling, external-call reentrancy, panic-on-attacker-input DoS, release-mode integer wrapping, host-IO (evm::) misuse, #[entrypoint]/#[public] access control, and lossy U256 conversions. Activate on any `.rs` file with `use stylus_sdk`, `#[entrypoint]`, `#[storage]`, `sol_storage!`, `#[public]`, or `#[payable]`.
---

# Stylus (Rust) detection

## When this applies

- Any `.rs` file importing `stylus_sdk` (`use stylus_sdk::{...}`)
- Macros `#[entrypoint]`, `#[storage]`, `sol_storage!`, `#[public]`, `#[payable]`
- Host-IO calls: `evm::`, `msg::`, `block::`, `contract::`, `call::` (`Call::new`, `transfer_eth`, `RawCall`)
- Stylus types `StorageU256`, `StorageMap`, `StorageVec`, `alloy_primitives::U256`/`Address`
- A `Cargo.toml` declaring `stylus-sdk` with `crate-type = ["lib", "cdylib"]`

Stylus runs the SAME EVM state and shares the SAME external-call surface as Solidity. Rust safety does NOT remove EVM-level footguns — it adds new ones (panics, wrapping arithmetic, aliasing).

## Detection patterns

### Storage aliasing / stale local copy of EVM state (HIGH)
```rust
let mut bal = self.balances.get(from);      // ← copies value out of storage
do_external_call();                          // callee may mutate self.balances
self.balances.insert(from, bal - amount);    // ← writes back STALE value
```
**Signal:** a `.get()` cached in a local, an intervening call/host-IO, then a `.set()`/`.insert()` of the stale local. Stylus storage reads are snapshots, not live references — re-read after any external call.

### Reentrancy via external call before state finalization (CRITICAL)
```rust
pub fn withdraw(&mut self) -> Result<(), Vec<u8>> {
    let amt = self.balance.get(msg::sender());
    call::transfer_eth(msg::sender(), amt)?;     // ← control leaves contract
    self.balance.setter(msg::sender()).set(U256::ZERO);  // ← AFTER the call
    Ok(())
}
```
**Signal:** `transfer_eth` / `Call::new().call(...)` / `RawCall` before the storage write that zeroes the credited amount. Reentrancy is OFF by default but `Call::new()` and `transfer_eth` still re-enter; CEI still required.

### Panic / unwrap on attacker input = revert-DoS (HIGH)
```rust
let idx: usize = msg::data()[0].into();
let entry = self.items.get(idx).unwrap();    // ← panics → reverts whole tx
```
**Signal:** `.unwrap()`, `.expect()`, indexing `[i]`, or arithmetic that can panic on caller-controlled input. A Rust panic traps the WASM and reverts — fine for the victim caller, but if it's on a path others depend on (batch settlement, queue processing) it's a griefing DoS. Return `Result`/`Err`, never panic on untrusted input.

### Release-mode integer wrapping (HIGH)
```rust
let total = a + b;          // ← in --release this WRAPS, no panic, no revert
self.supply.set(total);
```
**Signal:** bare `+`/`-`/`*` on `u64`/`u128`/`U256` in contract math. Stylus ships in release mode where overflow checks are OFF (wraps silently). `alloy` `U256` also wraps on `+`. Use `checked_add`/`checked_sub`/`checked_mul` (or `overflow-checks = true` in `Cargo.toml`).

### #[payable] vs unguarded msg::value (HIGH)
```rust
#[public]
impl Token {
    pub fn deposit(&mut self) {               // ← NOT #[payable]
        let v = msg::value();                  // value forced to 0 by ABI? no —
        self.credit.setter(msg::sender()).set(v);
    }
}
```
**Signal:** reading `msg::value()` in a non-`#[payable]` method (sent ETH gets stuck / call reverts depending on path), OR a `#[payable]` method that credits `msg::value()` without bounds, OR forgetting `msg::value()` is per-call (re-reads of it don't re-validate).

### #[public] / #[entrypoint] missing access control (HIGH)
```rust
#[public]
impl Vault {
    pub fn set_owner(&mut self, who: Address) {   // ← anyone can call
        self.owner.set(who);
    }
}
```
**Signal:** every method in a `#[public] impl` is externally callable. Admin/`set_*`/`mint`/`upgrade` methods with no `if msg::sender() != self.owner.get() { return Err(...) }` check. There is no implicit visibility gate — `#[public]` == external.

### Lossy / truncating U256 conversions (MEDIUM-HIGH)
```rust
let n: u64 = amount.to::<u64>();        // ← truncates if amount > u64::MAX
let small: u128 = big_u256.wrapping_to();
```
**Signal:** `.to::<u64>()`, `as u64`, `wrapping_to`, or `try_into().unwrap()` from `U256` to a narrow type used in accounting. Use `U256::try_into` and handle the error.

### Host-IO host call assumptions (MEDIUM)
```rust
let ok = RawCall::new().call(target, &data)?;  // ← gas, return-size, success
```
**Signal:** `RawCall`/`Call` results where success bool and return bytes aren't both checked, or hard-coded gas via `.gas(...)` that strands recipients. Same low-level-call hygiene as Solidity ([[unchecked-calls]]).

## Severity rubric

| Pattern | Severity | Notes |
|---|---|---|
| External call before state finalize (CEI broken) | **Critical** | Direct fund drain, same as Solidity |
| Stale storage cache across external call | **High** | Aliasing reads are snapshots |
| Release-mode wrapping in supply/balance math | **High** | Overflow checks off by default |
| `unwrap`/index/panic on attacker input | **High** | Revert-DoS on shared paths |
| `msg::value` mishandled vs `#[payable]` | **High** | Stuck or unbounded ETH |
| `#[public]` admin method, no sender check | **High** | Anyone calls privileged fn |
| Truncating `U256→u64/u128` in accounting | **Medium** | Value-dependent |
| Unchecked `RawCall`/hardcoded gas | **Medium** | Recipient-dependent |

## Remediation patterns

1. **CEI ordering** — write all storage effects before `transfer_eth`/`Call`. Re-read storage after any external call instead of trusting a cached local.
2. **`checked_*` arithmetic** everywhere, or set `overflow-checks = true` under `[profile.release]` in `Cargo.toml` (accept the WASM size/gas cost).
3. **Never `unwrap`/`expect`/raw-index on untrusted input** — propagate `Result<_, Vec<u8>>` and return `Err`.
4. **Gate privileged `#[public]` methods** with an explicit `msg::sender()` owner/role check; consider a reentrancy guard storage bool for callback paths.
5. **Make value-receiving methods `#[payable]`** and validate `msg::value()` bounds; reject unexpected value in non-payable methods.
6. **Use `try_into()` for `U256` narrowing** and handle the error rather than `as`/`wrapping_to`.

## False-positive notes

- `checked_add(...).ok_or(...)?` and similar are already safe — don't flag wrapping there.
- A `#[public]` method that is a pure view (`&self`) with no state writes and no value isn't an access-control issue.
- `.unwrap()` on a value the contract itself just constructed (not attacker-derived) is generally fine — focus on untrusted-input paths.
- Stylus reentrancy is disabled unless the `reentrant` feature is enabled; still flag CEI violations since the feature flag is set per-project and callbacks can re-enter cross-contract.

## Related

- [[reentrancy]] — Stylus shares the EVM external-call reentrancy surface
- [[integer-issues]] — release-mode wrapping + lossy U256 conversions
- [[access-control]] — `#[public]`/`#[entrypoint]` has no implicit visibility gate
