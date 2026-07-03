---
description: 60-second onboarding — set up .auditsentry.yml, choose severity profile, configure hooks, pick supported chains.
allowed-tools: Read, Write, Edit, Bash, AskUserQuestion
---

# /auditsentry-init — interactive setup

First-run experience. Walk the user through a minimal configuration so `/audit` works on their repo immediately.

## Procedure

### Step 1 — Detect the project

Look at the repo:
- Foundry (`foundry.toml`) → Foundry-mode default
- Hardhat (`hardhat.config.{ts,js}`) → Hardhat fallback
- Solidity files location: `src/`, `contracts/`, or other → set `include` glob accordingly
- Existing `.auditsentry.yml` → tell the user and ask whether to overwrite or migrate

### Step 2 — Ask 4 questions

Ask each as its own `AskUserQuestion` call (one at a time):

1. **Severity profile**
   - `strict` — block CI on Medium or worse
   - `standard` — block on High (recommended)
   - `lenient` — block on Critical only
2. **Target chains** (multi-select)
   - Ethereum · Berachain · Arbitrum · Base · Optimism · Polygon · BSC · Linea · zkSync · Scroll
3. **Hooks** (multi-select)
   - pre-commit quick-scan
   - pre-push full audit
   - pre-deploy check
   - post-test coverage
4. **Reporting formats** (multi-select)
   - Markdown · HTML · PDF · JSON · PNG card

### Step 3 — Write `.auditsentry.yml`

Write the config with the selected options. Comment liberally.

### Step 4 — Install hooks

For each selected hook:
- Foundry: append to `.git/hooks/<hook-name>` or `forge-hooks.toml`.
- Generic git: write a `.git/hooks/<hook-name>` that calls `claude code --slash="/quick-scan"`.

### Step 5 — Test run

Offer to run `/audit` on the bundled example vulnerable contract (`examples/VulnerableVault.sol`) so the user sees output immediately.

```
✓ .auditsentry.yml created
✓ Pre-commit hook installed
✓ Pre-push hook installed
✓ Reports will be saved to ./auditsentry-reports/

Try it:
  /audit examples/VulnerableVault.sol      ← see AuditSentry in action on a vulnerable demo
  /audit                                    ← audit your real code
```

## Notes

- Aim for under 60 seconds end-to-end.
- Don't ask questions whose answers can be inferred from the repo.
- Defaults should be safe (standard severity, full reports).
- If the user has already run `/auditsentry-init`, this is a no-op + offer `/auditsentry-init --reset`.
