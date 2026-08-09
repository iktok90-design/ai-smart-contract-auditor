## Summary

<!-- One sentence: what changes, why. -->

## Changes

- [ ] New slash command(s): …
- [ ] New skill(s): …
- [ ] New subagent(s): …
- [ ] New MCP tool(s): …
- [ ] New hook(s): …
- [ ] New demo contract(s): …
- [ ] New sample report(s): …
- [ ] Bug fix: …
- [ ] Refactor / DX: …
- [ ] Docs: …

## Test plan

- [ ] `make build` (MCP servers + scripts compile)
- [ ] `forge build` (Foundry compiles)
- [ ] `forge test` (existing tests still pass)
- [ ] `node scripts/dist/test-mcp.js` (MCP smoke test still passes)
- [ ] If new skill: tested against at least one vulnerable example in `examples/`
- [ ] If new MCP tool: stub returns realistic mock when API key absent

## Notes for reviewers

<!-- Anything that's not obvious from the diff. Trade-offs, alternatives considered, follow-up issues. -->

## Checklist

- [ ] Updated `CHANGELOG.md` under `[Unreleased]`
- [ ] Updated relevant docs (README.md / CONTRIBUTING.md / SECURITY.md if applicable)
- [ ] No secrets, API keys, or private contract source committed
- [ ] Commit messages are imperative, one-line subjects
