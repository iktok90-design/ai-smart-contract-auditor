# AuditSentry rule packs

Rule packs are user-published bundles of detection rules. Install with:

```
/plugin marketplace add <github-user>/<rule-pack-repo>
/plugin install <pack-name>
```

A rule pack lives in its own directory at the top level of a Claude plugin. Inside:

```
my-rule-pack/
├── pack.yml                  # metadata + author + license
├── skills/
│   ├── <rule-name>/SKILL.md  # detection rule (auto-loaded skill)
│   └── ...
├── agents/                   # optional — custom specialist subagents
└── README.md
```

## Pack manifest

```yaml
# pack.yml
name: my-rule-pack
version: 1.0.0
author: Alice (alice@example.com)
license: MIT
description: Custom detection rules for Acme Protocol forks.
target: solidity
requires_auditsentry: ">=0.1.0"
rules:
  - acme-fork-fee-bypass
  - acme-fork-cooldown-skip
```

## Authoring a rule

A rule is just a AuditSentry skill with frontmatter + detection guidance. See `community-pack-example/skills/example-fork-detection/SKILL.md` for a template.

## Validating a pack

Before publishing, check that every rule listed in `pack.yml` resolves to a
`skills/<rule>/SKILL.md` whose frontmatter `name` matches:

```bash
node scripts/validate-rule-pack.mjs rules/<your-pack>
```

It fails (non-zero) on missing required metadata, a listed rule without a skill
file, or a name mismatch, and warns about skill dirs not registered in `pack.yml`.

## Bundled packs

- `community-pack-example/` — copy this to start your own.
- `solady-gotchas/` — Solady-specific footguns (SafeTransferLib no-contract-check,
  guarded-initializer front-run, gas-optimized ERC20 assumptions).
- `uniswap-v4-hooks/` — Uniswap V4 hook footgun catalog (permission-flag
  mismatch, unlock-reentrancy, delta settlement).

## Curation

AuditSentry maintains a curated index at https://iktok90-design.github.io/AuditSentry/rules. Submit your pack via PR to https://github.com/iktok90-design/AuditSentry-rules-index. Curated packs:

- Get the verified-author badge
- Appear in `/plugin marketplace browse rules`
- Receive bug reports / community contributions

## Conventions

- One rule = one skill file. Don't bundle.
- Severity rubric: match AuditSentry's Critical/High/Medium/Low/Info scale.
- Always include false-positive notes.
- Always include a remediation pattern.
- Test on at least one realistic vulnerable example.

## Why rule packs

Custom forks of protocols (Uniswap V2 forks, Compound forks, Curve forks) often introduce protocol-specific bugs. The base AuditSentry skills can't anticipate every fork's quirks. Rule packs let auditors share the lessons learned from auditing one fork with everyone auditing similar forks.
