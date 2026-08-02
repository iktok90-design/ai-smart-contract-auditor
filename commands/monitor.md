---
description: Set up post-deployment monitoring — recommend which on-chain events to alert on and scan recent activity for high-severity changes.
argument-hint: "[address] [--chain ethereum]"
allowed-tools: Read, Grep, Glob, Bash, Skill, mcp__monitoring__*, mcp__block-explorer__*
---

# /monitor — post-deployment watch setup

Auditing finds bugs before launch; monitoring catches the rug *after* launch.
This command turns a contract into a concrete alerting plan and checks whether
anything alarming has already happened on-chain.

## Procedure

### Step 1 — Detect capabilities

From the source (or a deployed address via `block-explorer`), determine what the
contract can do: `hasOwner` (Ownable/AccessControl), `hasProxy` (EIP-1967 — use
`mcp__block-explorer__resolve_proxy`), `hasPause`, `hasRoles`, `hasMint`.

### Step 2 — Recommend monitors

```
mcp__monitoring__suggest_monitors(hasOwner=true, hasProxy=true, hasPause=true)
```

Returns prioritized monitors (event signature + topic0 + severity + why). Wire
these into your alerting stack (Forta, OpenZeppelin Defender, Tenderly alerts, or
a self-hosted log watcher keyed on the `topic0`s).

### Step 3 — Scan what already happened

For a deployed address, flag any high-severity events in recent history:

```
mcp__monitoring__scan_recent(chain=<chain>, address=<addr>)
```

Flags `Upgraded`, `OwnershipTransferred`, `AdminChanged`, `Paused`. Offline (or
with no RPC) it returns a labeled sample.

## Output

```
Monitoring plan for 0xVault… (ethereum)

  Recommended alerts (5):
    [critical] Ownership transfer    OwnershipTransferred(address,address)
    [critical] Implementation upgrade Upgraded(address)
    [high]     Contract paused        Paused(address)
    [high]     Large transfer         Transfer(...)  (threshold: > 5% TVL)
    [medium]   Contract unpaused      Unpaused(address)

  Recent activity scan (last 5000 blocks):
    ⚠ [critical] Upgraded(address) at block 0x10a2b3c — implementation changed, re-audit

  Wire topic0 filters into Forta / Defender / Tenderly. Re-run /audit-live after any upgrade.
```

## Notes

- Pair with `/pre-deploy` — monitoring is a launch-checklist item.
- A fired `Upgraded`/`AdminChanged` should trigger an immediate `/audit-live` of the new implementation.
- Set transfer thresholds relative to TVL, not absolute — see [[centralization-risk]].
