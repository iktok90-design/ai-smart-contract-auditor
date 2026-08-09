---
description: Audit third-party dependencies — resolve installed versions, cross-reference known-vulnerable releases, and flag vendored code that has diverged from upstream.
argument-hint: "[file-or-dir]"
allowed-tools: Read, Grep, Glob, Bash
---

# /audit-deps — vet the libraries you import

The bug isn't always in your code — sometimes it's in the version of OpenZeppelin you pinned 18 months ago. This command enumerates every dependency, resolves its real installed version, and checks it against a bundled advisory snapshot.

## Procedure

### Step 1 — Enumerate imports

Collect the dependency surface from every source of truth:

```bash
cat "${CLAUDE_PLUGIN_ROOT}/../remappings.txt" 2>/dev/null
cat package.json 2>/dev/null | node -e 'let p=require("/dev/stdin");console.log(JSON.stringify({...p.dependencies,...p.devDependencies}))'
grep -E 'libs\s*=' foundry.toml
```

Then sweep actual `import` statements for what is really referenced:

```bash
grep -rhoE 'import .*"(@openzeppelin|solady|solmate|forge-std)[^"]*"' src/ test/ | sort -u
```

Common families to resolve: `@openzeppelin/contracts`, `@openzeppelin/contracts-upgradeable`, `solady`, `solmate`, `forge-std`.

### Step 2 — Resolve installed versions

- **Git submodules** (`lib/openzeppelin-contracts`): `git -C lib/<dep> rev-parse HEAD` and `git -C lib/<dep> describe --tags` for the pinned SHA / tag.
- **npm**: read the resolved version from `node_modules/<pkg>/package.json`, not the range in `package.json`.
- Record exact version per dependency. A floating range (`^4.0.0`) installed as `4.9.6` is what matters.

### Step 3 — Cross-reference advisories

Match each resolved version against the bundled offline advisory snapshot. High-signal historical examples to check:

- **OpenZeppelin** — ECDSA signature malleability / `tryRecover` (< 4.7.3), TransparentUpgradeableProxy selector clash (< 4.8.3), Governor `castVote` / proposal-id collision, `Initializable` re-init (< 4.8), Multicall + ERC2771 address-spoofing (< 4.9.3).
- **Solady** — `SafeTransferLib` returning success for non-contract targets, `LibClone` immutable-arg edge cases.
- **solmate** — `ERC20.permit` deadline / `SafeTransferLib` no-code-check absence.

### Step 4 — Flag drift

- **Pragma drift** — pinned `pragma solidity 0.8.19;` in your code vs a floating `^0.8.0` in a dependency (or vice versa). [[pragma-and-addresses]].
- **Vendored divergence** — code copied into `src/vendor/` or `src/lib/`. Diff it against the upstream tag; flag any line that differs (security fixes silently dropped).

```bash
git -C lib/openzeppelin-contracts diff <pinned-tag> -- contracts/utils/cryptography/ECDSA.sol
```

## Output

```
Dependency audit (3 deps resolved):

  Dependency            Installed         Known issues                        Action
  ────────────────────────────────────────────────────────────────────────────────────
  @openzeppelin/contracts  4.7.0 (lib SHA a1b2c3) ECDSA malleability (GHSA-4g..)  ⬆ bump → 4.9.6
  solady                   0.0.124 (npm)         clean                           —
  forge-std                v1.7.1 (lib SHA d4e5f6) clean                           —

  Pragma drift:   your code pins 0.8.19; OZ floats ^0.8.0 — OK (compatible)
  Vendored:       src/vendor/MerkleProof.sol diverges from OZ 4.8 (1 line removed)
                  → upstream bounds-check dropped; review manually

Verdict: 1 high-severity dependency finding. Run /remediate to apply the bump.
```

## Notes

- Always resolve the *installed* version, never the range. A `^` range hides the real risk.
- Offline-first: the advisory snapshot ships with the plugin; no network needed.
- Vendored (copied) code is the silent killer — it never gets the upstream security patches. Diff it every audit.
- Hand confirmed findings to `/remediate` to generate the version-bump or patch diff.
