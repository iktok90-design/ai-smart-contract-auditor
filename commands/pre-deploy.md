---
description: Interactive pre-launch security checklist — walk the operational and code-safety gates and produce a final GO / NO-GO with each item PASS / FAIL / N-A.
argument-hint: "[dir]"
allowed-tools: Read, Grep, Glob, Bash, Agent, Skill
---

# /pre-deploy — the go/no-go gate

The last command you run before mainnet. It walks every launch-readiness gate — operational (multisig, timelock, monitoring) and code (clean strict audit, upgrade safety) — asks you to confirm the ones it can't verify from source, and returns a single GO or NO-GO.

## Procedure

### Step 1 — Locate the deployment

`$ARGUMENTS` is the project/contract dir (default `.`). Identify the contracts being launched and whether any are proxies.

### Step 2 — Walk the checklist

Go item by item. For each, verify from source/config where possible, otherwise ask the user to confirm:

1. **Multisig owner (not EOA)** — resolve `owner()` / admin role holder; confirm it is a Safe, not an EOA. [[centralization-risk]].
2. **Timelock on admin functions** — privileged setters routed through a timelock with a non-zero delay.
3. **Pause / circuit-breaker** — a `pause()` exists and is reachable by the guardian.
4. **Emergency withdrawal path** — funds recoverable if the contract is paused/bricked, without trapping users.
5. **Upgrade safety** — if any contract is a proxy, run `/upgrade-safety` and require it clean.
6. **Monitoring / alerting** — Forta, OZ Defender, or Tenderly alerts wired for admin events and anomalous flows.
7. **Bug bounty live** — `/bounty` program published before TVL arrives.
8. **Clean strict audit** — run `/audit-strict`; require zero unresolved High/Critical.
9. **Verified source on explorer** — source verified post-deploy (or planned in the deploy script).
10. **Constructor args sanity** — args match intended owner / fee / oracle; no placeholder addresses.
11. **Access-control matrix documented** — every role → who holds it → what it can do, written down.

### Step 3 — Score each item

Mark PASS / FAIL / N-A. Any FAIL on items 1, 2, 5, or 8 forces an overall NO-GO. Dispatch the `defender` agent to sanity-check borderline items.

### Step 4 — Output

```
Pre-deploy readiness: ./contracts (Vault is UUPS proxy)

   1. Multisig owner            PASS   owner = 0xSafe…ab (3/5 Safe)
   2. Timelock on admin         FAIL   setFee/setOracle are not behind the timelock
   3. Pause / circuit-breaker   PASS   pause() guarded by guardian role
   4. Emergency withdrawal      PASS   emergencyWithdraw() pull-based, no trap
   5. Upgrade safety            PASS   /upgrade-safety clean (append-only storage)
   6. Monitoring / alerting     FAIL   no Defender/Forta alerts configured
   7. Bug bounty live           N-A    launching as audited-only, bounty in 2 weeks
   8. Clean strict audit        PASS   /audit-strict: 0 High/Critical open
   9. Verified source           PASS   verification step in deploy script
  10. Constructor args sanity   PASS   owner/oracle/fee match runbook
  11. Access-control matrix      FAIL   roles undocumented

  ─────────────────────────────────────────────────────────────
  Verdict: NO-GO
  Blockers: #2 (admin not timelocked) is a hard gate.
  Before launch: route setters through the timelock, wire alerts (#6),
  and document the role matrix (#11).
```

## Notes

- This is operational + code readiness combined — a clean audit alone is not a GO.
- Items 1, 2, 5, 8 are hard gates: a FAIL on any of them is an automatic NO-GO regardless of the rest.
- N-A is allowed but must carry a justification (e.g. immutable contract → upgrade safety is N-A).
- Run this on a tagged release commit, not a dirty working tree — re-run after any post-checklist change.
- Chain it: `/upgrade-safety`, `/audit-strict`, and `/bounty` feed directly into items 5, 8, and 7.
