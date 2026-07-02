---
name: delegatecall-risks
description: Detect delegatecall risks — uninitialized proxies, malicious implementations, storage-slot collisions, delegatecall to user-controlled addresses, library delegatecall pitfalls. Activate on `delegatecall`, UUPS proxy upgrades, multicall implementations, diamond facets, governor-execute patterns.
---

# Delegatecall risk detection

## When this applies

- Any `delegatecall` site
- Proxy implementations (UUPS, Transparent, Beacon, Diamond)
- `Multicall` / `Multicall3` / batch-execute on the contract itself
- Governor's `execute()` flow
- Library `using X for *` where X uses delegatecall
- Generic call-forwarder / Safe modules

## Detection patterns

### delegatecall to user-controlled address (CRITICAL)
```solidity
function exec(address impl, bytes calldata data) external {
    impl.delegatecall(data);   // ← attacker provides impl, owns storage + can selfdestruct
}
```

### Uninitialized UUPS implementation (CRITICAL)
The *implementation* contract, if uninitialized, can be `initialize`d by anyone, then UUPS-upgraded to a `selfdestruct` impl, bricking the implementation. (Famous: Parity multisig.) Always `_disableInitializers()` in constructor.

### Storage slot collision in proxy (CRITICAL)
Proxy uses slot 0 for admin, impl uses slot 0 for `owner` → impl writes corrupt proxy admin. Use EIP-1967 namespaced slots.

### delegatecall + `msg.value` (MEDIUM-HIGH)
Forwarding `msg.value` via delegatecall to a function that doesn't expect ether → trapped funds or double-accounting.

### Multicall + delegatecall + msg.sender confusion (HIGH)
`Multicall` via delegatecall preserves `msg.sender`, so signed-payload-based functions (`permit`, ERC-2771) can be combined in surprising ways. Audit each function for "what if called via multicall with attacker-controlled previous step?"

### Diamond facet self-destruct (HIGH — pre-EIP-6780)
A malicious or buggy facet that calls `selfdestruct` deletes the diamond. EIP-6780 limits this to same-tx-deploy, but old diamonds remain at risk. See [[selfdestruct-eip6780]].

### Library marked `internal` actually compiled with delegatecall (HIGH)
Solidity compiles "linked" libraries to `delegatecall`. Linking the wrong library (or address) bricks downstream contracts.

### `_authorizeUpgrade` missing or weak (CRITICAL)
UUPS upgrade gate. If unguarded, anyone can upgrade the proxy.
```solidity
function _authorizeUpgrade(address) internal override {}   // ← no auth, anyone upgrades
```

### Cross-contract delegatecall to read-only function (LOW)
Used (rarely) for pattern obfuscation; usually a code smell.

## Severity rubric

| Pattern | Severity |
|---|---|
| delegatecall to user-supplied address | **Critical** |
| UUPS `_authorizeUpgrade` unguarded | **Critical** |
| Uninitialized UUPS impl with no `_disableInitializers` | **Critical** |
| Storage collision proxy/impl | **Critical** |
| Forwarding `msg.value` to non-payable target | **High** |
| Multicall + signed-msg sender ambiguity | **High** |
| Library linkage to wrong address | **High** |
| Diamond facet with selfdestruct path | **High** *(see [[selfdestruct-eip6780]])* |

## Remediation patterns

- Never delegatecall a non-allowlisted address. Hardcode or maintain a strict allowlist of valid implementations.
- UUPS: `_authorizeUpgrade` MUST check `onlyOwner` (or stricter).
- Implementation constructor: `_disableInitializers()`.
- Use EIP-1967 / EIP-7201 namespaced slots for proxy admin / impl.
- Multicall guard: forbid permit/auth-changing functions in batch, or limit to a non-delegatecall variant.
- After upgrading: verify storage layout via `forge inspect`.

## False-positive notes

- Solady `LibClone.deployERC1967` and similar canonical proxy libraries are well-tested.
- delegatecall to an `immutable` implementation address (set in constructor, not changeable) is much lower risk.

## Related

- [[initialization]]
- [[storage-layout]]
- [[access-control]]
- [[selfdestruct-eip6780]]
