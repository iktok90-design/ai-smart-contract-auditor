---
description: Verify deployed bytecode matches the source you have, with correct constructor args.
argument-hint: "<chain> <address>"
allowed-tools: Read, Bash, Agent, mcp__block-explorer__*, mcp__forge-runner__*
---

# /verify-deploy — does the deployed code match the source?

Compare deployed bytecode at `<chain>:<address>` with the local source + constructor args.

## Procedure

### Step 1 — Fetch deployed runtime bytecode

```
mcp__block-explorer__get_runtime_code(chain=<chain>, address=<addr>)
```

### Step 2 — Compile local source

```
mcp__forge-runner__build()
```

Pull the runtime bytecode for the matching contract.

### Step 3 — Strip metadata

Solidity appends a CBOR metadata blob at the end of the runtime bytecode containing the IPFS / Swarm hash of the source. Strip it for comparison:

```
Detect: bytecode ends with `0x...a26469706673...` (CBOR)
Length: last 53 bytes
```

### Step 4 — Compare

Byte-wise compare the stripped runtime code.

### Step 5 — Decode constructor args

```
mcp__block-explorer__get_constructor_args(chain=<chain>, address=<addr>)
```

Compare with the expected args from your deploy script.

### Step 6 — Output

Three cases:

**Match:**
```
✓ Deployed bytecode matches local source.
  Constructor args: match.
  Metadata hash:    QmXabc...  (matches IPFS-pinned source)
```

**Mismatch:**
```
✗ Bytecode mismatch.
  Local compiled:    32K bytes
  Deployed runtime:  31.8K bytes
  Diff:              5 byte regions differ (likely compiler settings)

  Likely cause: optimizer runs (200 vs 999999), Solidity version, library linking.
```

**Metadata-only difference:**
```
⚠ Runtime bytecode matches; metadata hash differs.
  This is normal if the local source is at a different commit than the deployment.
  Consider this a soft match.
```

## Notes

- Useful before bug bounty submissions: prove you've audited *the actual deployed code*, not a different commit.
- For proxies, run against the *implementation*, not the proxy.
- For multi-contract systems, run for each.
