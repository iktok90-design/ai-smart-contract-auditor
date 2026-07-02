---
name: solana-anchor
description: Detect bug classes specific to Solana / Anchor (Rust) programs — missing signer checks, missing account owner checks, account-confusion / type-cosplay without discriminator validation, unchecked AccountInfo, non-canonical PDA seeds/bumps & seed collisions, missing has_one/constraint, CPI to unverified programs, close-account lamport-drain & revival, sysvar spoofing, and arbitrary-account substitution. Activate on any `.rs` file with `use anchor_lang`, `#[program]`, `#[derive(Accounts)]`, `#[account]`, `Signer<'info>`, or `AccountInfo`.
---

# Solana / Anchor (Rust) detection

## When this applies

- Any `.rs` file importing `anchor_lang` (`use anchor_lang::prelude::*`)
- Macros `#[program]`, `#[derive(Accounts)]`, `#[account]`, `#[instruction(...)]`
- Account wrappers `Signer<'info>`, `Account<'info, T>`, `AccountInfo<'info>`, `UncheckedAccount`, `Program<'info, T>`, `Sysvar<'info, T>`
- PDA derivation: `seeds = [...]`, `bump`, `find_program_address`, `create_program_address`
- CPI: `CpiContext`, `invoke`, `invoke_signed`, `*_cpi`

Solana has no implicit caller. Every authority, ownership, and identity invariant must be asserted explicitly in the account struct or handler.

## Detection patterns

### Missing signer check (CRITICAL)
```rust
#[derive(Accounts)]
pub struct Withdraw<'info> {
    pub authority: AccountInfo<'info>,   // ← not Signer; nobody proves they're authority
    #[account(mut)]
    pub vault: Account<'info, Vault>,
}
```
**Signal:** an "authority"/"owner"/"admin" account typed `AccountInfo`/`UncheckedAccount` instead of `Signer<'info>`, or a handler reading `ctx.accounts.x` without checking `x.is_signer`. Anyone passes the real authority's pubkey without their signature.

### Missing owner check / arbitrary account substitution (CRITICAL)
```rust
let data = ctx.accounts.state.to_account_info();
let state = State::try_from_slice(&data.data.borrow())?;  // ← no owner check
```
**Signal:** deserializing from a raw `AccountInfo`/`UncheckedAccount` without verifying `account.owner == program_id`, or using `Account<T>` for data but not constraining which account. An attacker passes a fake account they own with crafted bytes. `Account<'info, T>` checks owner+discriminator; raw `AccountInfo` checks nothing.

### Type cosplay / missing discriminator validation (HIGH)
```rust
let user: UserAccount = UserAccount::try_from_slice(&info.data.borrow())?;  // ← any 8-byte
```
**Signal:** `try_from_slice` / `try_deserialize_unchecked` on raw data, bypassing the Anchor 8-byte discriminator. A different account type with the same layout (e.g. `Config` passed where `User` is expected) is accepted. Use `Account<'info, T>` so Anchor enforces the discriminator.

### Non-canonical PDA bump / seed collision (HIGH)
```rust
let (pda, _bump) = Pubkey::create_program_address(
    &[b"vault", user.key().as_ref(), &[user_supplied_bump]],  // ← attacker bump
    program_id,
)?;
```
**Signal:** `create_program_address` with a caller-supplied bump (multiple valid PDAs → forgeable accounts), bumps not stored/re-checked against the canonical one, or seeds that omit a discriminator so `["vault", x]` collides with `["vault", x]` of another domain. Use `find_program_address` (canonical bump) or Anchor `seeds`+`bump` and persist `bump`.

### Missing has_one / constraint linking accounts (HIGH)
```rust
#[derive(Accounts)]
pub struct Update<'info> {
    #[account(mut)]                       // ← no has_one = authority
    pub config: Account<'info, Config>,
    pub authority: Signer<'info>,         // signs, but is never tied to config.authority
}
```
**Signal:** a `Signer` that's never bound to the data account it should control — no `#[account(has_one = authority)]` or `#[account(constraint = config.authority == authority.key())]`. Any signer updates any config. Same for `mint`, `owner`, `vault` relationships.

### CPI to unverified program (HIGH)
```rust
let cpi = CpiContext::new(ctx.accounts.token_program.to_account_info(), ...);
token::transfer(cpi, amount)?;   // ← token_program is an unconstrained AccountInfo
```
**Signal:** `CpiContext::new` whose program account isn't constrained to the expected `Program<'info, Token>` / known program id, or `invoke`/`invoke_signed` to a caller-supplied program. Attacker passes a malicious program at the `token_program` slot. Type it `Program<'info, Token>` or assert the key.

### close-account lamport drain / revival (HIGH)
```rust
**ctx.accounts.dest.lamports.borrow_mut() += account.lamports();
**account.lamports.borrow_mut() = 0;        // ← manual close, no discriminator zeroing
```
**Signal:** manual lamport zeroing without wiping the discriminator/data, or `#[account(close = ...)]` whose data the attacker can re-fund in the same tx (revival attack) before it's GC'd. Use Anchor `close = recipient` (it zeroes the discriminator) and don't reuse closed accounts in the same instruction.

### Sysvar / clock spoofing (MEDIUM-HIGH)
```rust
pub clock: AccountInfo<'info>,            // ← passed as raw account, not Sysvar
let now = Clock::from_account_info(&ctx.accounts.clock)?.unix_timestamp;
```
**Signal:** Clock/Rent/Instructions sysvars typed as `AccountInfo`/`UncheckedAccount` rather than `Sysvar<'info, Clock>` or fetched via `Clock::get()`. An attacker substitutes a fake sysvar account with controlled time/data.

### Unchecked AccountInfo used for value flow (MEDIUM)
```rust
/// CHECK: comment present but the account is then trusted for transfers
pub recipient: UncheckedAccount<'info>,
```
**Signal:** `UncheckedAccount`/`AccountInfo` (or a `/// CHECK:` with no real validation) that's subsequently used as a transfer destination, authority, or data source. The `CHECK` comment silences Anchor but doesn't add a constraint.

## Severity rubric

| Pattern | Severity | Notes |
|---|---|---|
| Authority as `AccountInfo`, no signer proof | **Critical** | Impersonate any authority |
| Deserialize raw account, no owner check | **Critical** | Fake-account substitution |
| Type cosplay (no discriminator) | **High** | Wrong account type accepted |
| Caller-supplied / non-canonical PDA bump or seed collision | **High** | Forge PDA-owned accounts |
| Missing `has_one`/`constraint` linking signer↔data | **High** | Any signer mutates any record |
| CPI to unconstrained program account | **High** | Malicious program at slot |
| Manual close / revivable closed account | **High** | Lamport drain / reuse |
| Sysvar passed as `AccountInfo` | **Medium** | Spoofed clock/rent |
| `UncheckedAccount` used for value flow | **Medium** | Depends on later checks |

## Remediation patterns

1. **Type authorities as `Signer<'info>`** and assert their relationship with `#[account(has_one = authority)]` or `constraint =`.
2. **Use `Account<'info, T>`** (not raw `AccountInfo`) so Anchor enforces `owner == program_id` AND the 8-byte discriminator; never `try_from_slice`/`try_deserialize_unchecked` on untrusted accounts.
3. **Derive PDAs canonically** — Anchor `seeds = [...]` + `bump` (or `find_program_address`), store the bump, include a domain discriminant in seeds to prevent collisions.
4. **Constrain CPI program accounts** to `Program<'info, Token>`/known ids; validate any account passed to `invoke`/`invoke_signed`.
5. **Close with `#[account(close = recipient)]`** so the discriminator is zeroed; don't reuse a closed account within the instruction.
6. **Fetch sysvars via `Clock::get()`** or `Sysvar<'info, Clock>`, never a raw account.
7. **Resolve every `/// CHECK:`** with an actual key/owner constraint, not just a comment.

## False-positive notes

- An `AccountInfo`/`UncheckedAccount` with a real `#[account(address = KNOWN_PUBKEY)]` or in-handler key assertion is validated — don't flag it as unchecked.
- `Account<'info, T>` already enforces owner + discriminator; type-cosplay and owner-check findings apply to RAW `AccountInfo`/`try_from_slice` paths only.
- A `Signer` that legitimately needs no data binding (e.g. a fee payer that only pays rent) doesn't need `has_one`.
- `init`/`init_if_needed` accounts set their own owner to the program — owner-check findings don't apply at init.

## Related

- [[access-control]] — signer, owner, and has_one constraints are Solana's entire auth model
- [[signature-replay]] — Solana txs need recent-blockhash + nonce discipline; instruction-level replay across PDAs
