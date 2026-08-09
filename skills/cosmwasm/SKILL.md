---
name: cosmwasm
description: Detect bug classes specific to CosmWasm (Rust) contracts — missing info.sender authorization in execute handlers, unbounded map iteration → gas/DoS, reply/submessage reply_id confusion, migrate admin backdoors, addr_validate vs raw string addresses, unchecked info.funds, Uint128 overflow, query reentrancy, and migration/version state. Activate on any `.rs` file with `use cosmwasm_std`, `#[entry_point]`, `ExecuteMsg`, `InstantiateMsg`, `QueryMsg`, `cw_storage_plus`, or `DepsMut`.
---

# CosmWasm (Rust) detection

## When this applies

- Any `.rs` file importing `cosmwasm_std` (`use cosmwasm_std::{...}`)
- Macros/attrs `#[entry_point]`, `#[cw_serde]`; enums `ExecuteMsg`, `InstantiateMsg`, `QueryMsg`, `MigrateMsg`, `SudoMsg`
- `cw_storage_plus` types `Map`, `Item`, `IndexedMap`; `DepsMut`/`Deps`, `MessageInfo`, `Env`
- `SubMsg`, `Reply`, `reply()`, `set_contract_version`, `cw2`

CosmWasm has no `msg.sender`-gated visibility and no implicit auth. Every `execute` branch is callable by anyone unless the handler checks `info.sender`.

## Detection patterns

### Missing info.sender authorization in execute (CRITICAL)
```rust
ExecuteMsg::SetConfig { admin } => {
    let mut cfg = CONFIG.load(deps.storage)?;
    cfg.admin = admin;                          // ← no info.sender check
    CONFIG.save(deps.storage, &cfg)?;
    Ok(Response::new())
}
```
**Signal:** an `ExecuteMsg` arm that mutates privileged state (`admin`, `owner`, `mint`, `withdraw`, `pause`) with no `if info.sender != cfg.admin { return Err(Unauthorized) }`. Anyone can dispatch any message.

### Unbounded map iteration → gas exhaustion DoS (HIGH)
```rust
let all: Vec<_> = BALANCES
    .range(deps.storage, None, None, Order::Ascending)   // ← whole map
    .collect::<StdResult<_>>()?;
for (addr, bal) in all { /* mutate each */ }
```
**Signal:** `.range(.., None, None, ..)` / `.keys(..)` over a user-growable `Map` inside `execute`, or a loop whose length attackers control. Each entry costs gas; an attacker inflates the map until the handler always runs out of gas (permanent freeze). Paginate with `start_after` + `limit`.

### reply_id confusion / unvalidated submessage reply (HIGH)
```rust
#[entry_point]
pub fn reply(deps: DepsMut, _env: Env, msg: Reply) -> Result<Response, ContractError> {
    let res = msg.result.unwrap();              // ← assumes success; panics on err
    // no match on msg.id → all replies handled identically
    parse_instantiate_response_data(&res.data.unwrap())?;
    Ok(Response::new())
}
```
**Signal:** a `reply` handler that doesn't `match msg.id { ... }` against known reply IDs, or `.unwrap()`s `msg.result`/`msg.result.data`, or trusts `SubMsgResult` data without checking it came from the expected submessage. Different submessages can land in the same reply with attacker-influenced data.

### migrate admin backdoor / unguarded migrate (HIGH)
```rust
#[entry_point]
pub fn migrate(deps: DepsMut, _env: Env, msg: MigrateMsg) -> Result<Response, ContractError> {
    CONFIG.save(deps.storage, &Config { admin: msg.new_admin })?;  // ← arbitrary rewrite
    Ok(Response::new())                          // no version/sender guard
}
```
**Signal:** `migrate` that overwrites owner/config from `MigrateMsg` without checking `set_contract_version`/`get_contract_version` (downgrade or replay), or a centralization risk where the code-admin can swap logic+state at will. Even with chain-level migrate auth, document who holds the admin.

### addr_validate vs raw string address (MEDIUM-HIGH)
```rust
let recipient = msg.to;                          // ← String, never validated
BALANCES.save(deps.storage, &Addr::unchecked(&recipient), &amt)?;  // ← unchecked
```
**Signal:** `Addr::unchecked(...)` on user input, or storing/using a `String` address without `deps.api.addr_validate(&s)?`. Unvalidated/un-normalized addresses split balances across casing/bech32 variants and break invariants.

### Unchecked info.funds (HIGH)
```rust
ExecuteMsg::Deposit {} => {
    let amount = msg.amount;                     // ← trusts a field, not info.funds
    CREDIT.save(deps.storage, &info.sender, &amount)?;
    Ok(Response::new())
}
```
**Signal:** crediting a deposit from a message field instead of `info.funds`, or not asserting `info.funds` contains the expected denom AND amount (`must_pay`/`one_coin` from `cw_utils`). Also flag handlers that ignore unexpected attached funds.

### Uint128 / Uint256 overflow & raw arithmetic (HIGH)
```rust
let total = a + b;                               // ← Uint128 Add can overflow → error,
let scaled = price * qty;                        //    but `as`/u128 casts wrap silently
```
**Signal:** `Uint128`/`Uint256` `+`/`-`/`*` where overflow should be a domain error vs a panic, OR casting to/from primitive `u128`/`u64` with `as`/`.u128()` in accounting. Prefer `checked_add`/`checked_sub`/`checked_mul` returning `OverflowError`.

### Query reentrancy / cross-contract query trust (MEDIUM)
```rust
let price: PriceResp = deps.querier.query_wasm_smart(oracle, &QueryMsg::Price {})?;
```
**Signal:** acting on a `query_wasm_smart` result from a user-supplied contract address, or assuming queries are side-effect-free guarantees (a malicious queried contract returns adversarial data). Validate the oracle/contract address against an allowlist.

## Severity rubric

| Pattern | Severity | Notes |
|---|---|---|
| Execute arm mutating privileged state, no `info.sender` check | **Critical** | Anyone seizes admin/funds |
| Unbounded `.range(None,None)` over user-growable map | **High** | Permanent gas-DoS freeze |
| `reply` without `match msg.id` / unwrap of result | **High** | Cross-submsg data confusion |
| `migrate` overwrites owner/config unguarded | **High** | Logic+state backdoor |
| Deposit credited from field, not `info.funds` | **High** | Free credit / fund theft |
| `Uint128` overflow / lossy primitive cast | **High** | Value-dependent |
| `Addr::unchecked` on user input | **Medium** | Address-spoof / split state |
| Acting on query result from unvalidated contract | **Medium** | Oracle-trust dependent |

## Remediation patterns

1. **Authorize first** — every privileged `execute` arm starts with `ensure_eq!(info.sender, cfg.admin, ContractError::Unauthorized {})`.
2. **Paginate iteration** — `start_after` + bounded `limit` (e.g. 30); never `.range(None, None)` over attacker-growable maps in `execute`.
3. **Match reply IDs** — declare `const REPLY_X: u64`, `match msg.id { REPLY_X => ..., _ => Err(...) }`, and validate `SubMsgResult` before trusting its data.
4. **Guard migrate** — check `cw2::get_contract_version`, reject downgrades, and document the migrate-admin in centralization disclosures.
5. **Validate addresses** — `deps.api.addr_validate(&s)?`, never `Addr::unchecked` on user input.
6. **Verify funds** — use `cw_utils::must_pay`/`one_coin` against `info.funds`; reject unexpected denoms.
7. **`checked_*` math** on `Uint128`/`Uint256`; avoid `as`/`.u128()` casts in accounting.

## False-positive notes

- `Addr::unchecked` is acceptable in tests and when re-loading an address the contract itself validated and stored earlier.
- An `execute` arm that is intentionally permissionless (e.g. public `Claim {}` keyed by `info.sender`) needs no admin check — confirm it can only affect the caller's own state.
- `Uint128` `+`/`-` already returns an `OverflowError` (not a silent wrap) — the real risk is primitive `u128`/`as` casts and `Decimal` scaling; focus there.
- A bounded `.range(.., Some(limit))` is fine.

## Related

- [[access-control]] — CosmWasm has no implicit sender gate; every execute arm is public
- [[dos-vectors]] — unbounded map iteration is the canonical CosmWasm gas-freeze
- [[centralization-risk]] — migrate/admin powers concentrate upgrade + state control
