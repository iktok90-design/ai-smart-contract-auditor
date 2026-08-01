---
name: inline-assembly
description: Detect bugs in inline Yul / assembly — manual memory mismanagement, free-memory-pointer corruption, return-data manipulation, missing return-data-size checks, dirty-bits in narrow types. Activate on any `assembly { … }` block, Yul code, Solady-style assembly usage.
---

# Inline assembly / Yul auditor

## When this applies

- Any `assembly { … }` block
- Pure Yul contracts
- Solady's heavy use of optimized assembly
- Custom delegatecall wrappers, manual memory copy, custom signature verifiers
- Gas-optimization-driven assembly substitutions of Solidity primitives

## Detection patterns

### Free-memory-pointer not updated after allocation (HIGH)
```solidity
assembly {
    let ptr := mload(0x40)
    mstore(ptr, value)
    // ← didn't bump 0x40, next allocation corrupts
}
```
After writing memory, update `mload(0x40)` to past the write.

### Memory clobbering via reused scratch space (HIGH)
Yul scratch is `0x00-0x3F`. External calls / Solidity assignments may overwrite. Don't store across foreign-code boundaries.

### Return data not size-checked (HIGH)
```solidity
assembly {
    let ok := call(gas(), target, 0, in, insz, 0, 32)
    returndatacopy(0, 0, 32)
    let r := mload(0)   // ← if target returned < 32 bytes, r has trailing memory garbage
}
```
Check `returndatasize()` before copying.

### Dirty high bits in narrow types (HIGH)
A `uint8` read from calldata via `calldataload` has the high 248 bits unmasked. Mask with `and(..., 0xff)` before comparing.

### Returning attacker-controlled memory (HIGH)
```solidity
assembly { return(0, calldatasize()) }   // ← returns calldata; if function spec says bytes32, parsers blow up
```

### Mishandling 0x40 / 0x60 (FMP and zero slot) (HIGH)
Writing to `0x60` (zero slot) is a known footgun — that slot must stay zero. Solidity uses it in mappings.

### `mstore` to slot 0/0x20 not cleared after a call (MEDIUM-HIGH)
Reused scratch leaks data across functions.

### Loop bounds in assembly without checks (HIGH)
Easy to write infinite loops or array-bound-violators.

### Wrong opcode (callcode, suicide, gas costs) (HIGH)
Legacy opcodes still parseable but deprecated. `callcode` is the wrong delegatecall; `suicide` is `selfdestruct`.

### Address pointers larger than 20 bytes (HIGH)
`address` masked at 20 bytes; assembly users sometimes treat as full 32 bytes and leave dirty bits.

## Severity rubric

| Pattern | Severity |
|---|---|
| Free-memory-pointer corruption | **High** |
| Unchecked returndatasize | **High** |
| Dirty high bits on narrow type | **High** |
| Wrong/legacy opcode | **High** |
| Writes to 0x60 (zero slot) | **High** |
| Reused scratch across foreign call | **High** |
| Assembly returning misformatted ABI data | **High** |
| Pure-Yul math with no overflow proof | **High** |
| Comment-less assembly block in production code | **Low** *(maintainability)* |

## Remediation patterns

- Prefer audited primitives (OZ, Solady) — don't roll your own assembly.
- Document every assembly block: invariants, memory map, why.
- Always update `mload(0x40)` after writes; explicitly zero scratch after use.
- Check `returndatasize()` before `returndatacopy`.
- Mask narrow types: `and(x, 0xff)` for `uint8`, `and(x, 0xffff)` for `uint16`, etc.
- Test with edge-case inputs (zero-length return, oversize return, dirty high bits).

## False-positive notes

- Single-line read of fixed slot (e.g. `chainid()`, `gasprice()`, `caller()`) is safe.
- Solady's published assembly libraries are audited; using them as-is is fine — verify version pinning.

## Related

- [[assembly-auditor]] (subagent)
- [[unchecked-calls]]
- [[storage-layout]]
