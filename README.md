# 🔐 AuditSentry — AI-Powered Smart Contract Auditor

> **AI-driven security analysis for Solidity & Vyper smart contracts.** AuditSentry combines Claude Code with 13 specialized MCP servers to deliver professional-grade vulnerability detection, working exploit PoCs, mainnet-fork simulation, and submission-ready audit reports — across all major EVM chains.

<p align="center">
  <b>🔍 AI Audit &nbsp;|&nbsp; ⚡ Exploit PoC &nbsp;|&nbsp; 🔬 Fork Simulation &nbsp;|&nbsp; 📊 Gas Profiling &nbsp;|&nbsp; 🏷️ On-Chain Certificates</b>
</p>

---

## ✨ What Makes AuditSentry Different

AuditSentry deploys **23 specialized AI agents** in parallel, each attacking a different surface of your smart contract. Findings are deduplicated, CVSS-scored, and formatted into professional audit reports — in minutes, not weeks.

| Capability | Description |
|---|---|
| 🤖 **AI-Powered Analysis** | Claude Code orchestrates deep semantic analysis beyond pattern matching |
| 🔥 **Working Exploit PoCs** | Generates executable Foundry/Hardhat proof-of-concept for every finding |
| 🔬 **Mainnet-Fork Simulation** | Tests vulnerabilities against live chain state via Anvil/Tenderly |
| 📊 **Gas Profiling** | Identifies optimization opportunities with precise gas cost breakdowns |
| 🏷️ **On-Chain Certificates** | Soulbound NFT audit certificates on Berachain for verified audits |
| 📋 **Multi-Format Reports** | Markdown, HTML, PDF, and shareable PNG audit cards |

---

## 🚀 Quick Install

```bash
# Clone the repository
git clone https://github.com/iktok90-design/ai-smart-contract-auditor.git
cd ai-smart-contract-auditor

# Build MCP servers + tooling
make build

# Run a demo audit on the bundled vulnerable contract
make audit-demo
```

### Claude Code Plugin (local install)

```bash
# Clone and build — MCP servers must be compiled to work with Claude Code:
git clone https://github.com/iktok90-design/ai-smart-contract-auditor.git ~/.claude/skills/auditsentry
cd ~/.claude/skills/auditsentry && make build
# Restart Claude Code — the plugin loads automatically from ~/.claude/skills/
```

> **Marketplace listing pending.** Once approved, install via `/plugin install auditsentry`.  
> **Note:** `make build` is required — it compiles the MCP servers and installs tooling dependencies.

---

## 🎯 45 Audit Commands

### Core Audit
`/audit` `/audit-deep` `/audit-strict` `/audit-changes` `/audit-live` `/audit-history` `/audit-deps` `/audit-multi-chain` `/quick-scan` `/rug-check` `/score` `/explain`

### Exploit & Simulation
`/exploit` `/exploit-chain` `/exploit-live` `/simulate` `/replay-incident`

### Testing & Verification
`/test-gen` `/invariant` `/fuzz` `/coverage` `/symbolic` `/prover`

### Analysis & Diffing
`/gas` `/upgrade-safety` `/verify-deploy` `/diff-audit` `/audit-diff` `/pre-deploy` `/monitor`

### Reporting
`/report` `/card` `/remediate` `/bounty` `/bounty-submit`

### Tool Integration
`/slither` `/mythril`

### Workflow
`/auditsentry-init` `/dismiss` `/verify-finding` `/demo`

### Notifications
`/notify-slack` `/notify-discord` `/tweet`

---

## 🤖 23 AI Specialist Agents

| Category | Agents |
|---|---|
| **Core** | `attacker` · `defender` · `exploit-poc-writer` · `invariant-writer` · `gas-optimizer` · `remediation-suggester` · `report-writer` · `assembly-auditor` |
| **Protocol** | `amm-specialist` · `lending-specialist` · `staking-specialist` · `bridge-specialist` · `governance-specialist` · `yield-aggregator-specialist` · `nft-specialist` |
| **Advanced** | `aa-specialist` (ERC-4337) · `crosschain-messaging-specialist` · `restaking-specialist` · `intents-specialist` · `l2-sequencer-specialist` |
| **Specialized** | `vyper-specialist` · `economic-rug-specialist` · `zk-verifier-specialist` |

---

## 🛡️ 45 Vulnerability Detection Skills

AuditSentry auto-invokes specialized detection skills covering the complete smart contract vulnerability landscape:

**Critical:** Reentrancy · Arithmetic Over/Underflow · Access Control · Uninitialized Proxies · Delegatecall Injection · Self-Destruct · Signature Replay · Oracle Manipulation · Flash Loan Attacks

**High:** Front-Running / MEV · DOS Vectors · Storage Collision · ERC-4626 Inflation · Fee-on-Transfer · Permit2 Patterns · ERC-1271 Signatures · Cross-Contract State · Liquidation Cascade

**Chain-Specific:** L2 Sequencer · Restaking (EigenLayer) · Cross-Chain Messaging · Solana/Anchor · Cosmos/CosmWasm · ZK Verifier Bugs · ERC-4337 Account Abstraction · ERC-7683 Intents · Diamond EIP-2535 · Stylus/Rust

---

## 🔌 13 MCP Servers

| Server | Function |
|---|---|
| `block-explorer` | Fetch source, ABI, bytecode, storage from Etherscan & alikes |
| `forge-runner` | Compile, test, inspect storage via Foundry |
| `hardhat-runner` | Compile & test via Hardhat |
| `anvil` | Spin up local forks, snapshot/revert, send raw transactions |
| `tenderly` | Simulate transactions on Tenderly forks |
| `c4-history` | Search Code4rena historical findings |
| `sherlock-history` | Search Sherlock historical findings |
| `gas-tracker` | Real-time gas prices across all chains |
| `token-metadata` | Token safety checks, quirks detection, metadata |
| `slither-runner` | Run Slither static analysis |
| `mythril-runner` | Run Mythril symbolic analysis |
| `fuzz-runner` | Property fuzzing via Echidna, Medusa, Halmos |
| `monitoring` | On-chain alert monitoring for deployed contracts |

---

## 📦 Dependencies

AuditSentry's MCP servers are built on Node.js with minimal, well-audited dependencies:

- **hex-encode-utils** — Fast hex encoding/decoding for transaction calldata analysis
- **@noble/curves** & **@noble/hashes** — Audited cryptographic primitives
- **handlebars** — Report template rendering
- **sharp** — PNG audit card generation
- **TypeScript** — Type-safe MCP server implementations

---

## 🧪 Development

```bash
git clone https://github.com/iktok90-design/ai-smart-contract-auditor.git
cd ai-smart-contract-auditor

make build        # Build MCP servers + scripts
make test         # Run full test suite (Foundry + MCP + scripts)
make docs         # Regenerate documentation
make bench        # Run detection benchmark
```

---

## 📄 License

MIT © 2026 Iktok Security Labs — Zug, Switzerland

> **Disclaimer:** AuditSentry is a security research tool. Always verify findings manually. No automated tool can guarantee 100% vulnerability coverage. Use responsibly.

