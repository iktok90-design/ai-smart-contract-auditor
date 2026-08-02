# AuditSentry benchmark

Honest accuracy measurement: run AuditSentry against a labeled corpus and score
**recall** (did it find the known bugs?) and **precision** (how much of what it
reported was real?).

## Ground truth

`expected.json` labels each bundled demo contract with the vulnerability classes
(skill slugs / finding `pattern` values) a correct audit must surface. These are
intentionally-vulnerable contracts with documented bugs, so the labels are exact.

## Running it

1. Audit each target and save the JSON report as `<Target>.json` (the key from
   `expected.json`) into a directory, e.g. `bench/runs/2026-06-16/`:

   ```
   /audit examples/VulnerableVault.sol     # save report JSON as VulnerableVault.json
   /audit examples/SpotOracleLending.sol   # → SpotOracleLending.json
   ...
   ```

   (Reports must be the `schemas/finding.schema.json` shape — i.e. a `findings`
   array where each finding has a `pattern`.)

2. Score:

   ```bash
   node scripts/dist/benchmark.js \
     --expected bench/expected.json \
     --findings bench/runs/2026-06-16
   ```

   Output is per-target recall/precision plus an aggregate F1.

## What good looks like

On the bundled demos a healthy AuditSentry run should hit **100% recall** (every
documented bug found) with high precision. Recall < 100% means a real bug was
missed — investigate the relevant skill. Use this to catch regressions when
editing skills or the `/audit` flow.

The scoring logic (`scripts/src/benchmark.ts`) is unit-tested in
`scripts/test/benchmark.test.mjs`.
