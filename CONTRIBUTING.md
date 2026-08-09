# Contributing to AuditSentry

We welcome contributions to AuditSentry! Here's how to get started.

## Development Setup

```bash
git clone https://github.com/iktok90-design/ai-smart-contract-auditor.git
cd ai-smart-contract-auditor
make build
make test
```

## Project Structure

```
AuditSentry/
├── mcp/           # 13 MCP servers (Node.js/TypeScript)
├── scripts/       # Report rendering, notifications, tooling
├── commands/      # 45 Claude Code slash commands
├── agents/        # 23 AI specialist agent definitions
├── skills/        # 45 vulnerability detection skills
├── rules/         # Customizable rule packs
├── hooks/         # Git hooks for pre-commit / pre-push
├── examples/      # Vulnerable demo contracts (Solidity)
├── bench/         # Detection benchmark suite
└── docs/          # Documentation & gallery
```

## Pull Request Process

1. Fork the repository
2. Create a feature branch
3. Write tests for your changes
4. Run `make test` to verify everything passes
5. Submit a PR with a clear description

---

Iktok Security Labs — Zug, Switzerland
