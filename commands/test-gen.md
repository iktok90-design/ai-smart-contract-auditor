---
description: Generate a Foundry test suite — happy path + edge cases + adversarial tests — for a contract or function.
argument-hint: "<file-or-function>"
allowed-tools: Read, Write, Bash, Agent, Skill, mcp__forge-runner__*
---

# /test-gen — generate a Foundry test suite

For `$ARGUMENTS` (a file, a contract, or a `Contract.function`), produce tests.

## What it generates

For each public/external function:

1. **Happy-path test** — typical input, expected output.
2. **Boundary tests** — zero, max, off-by-one.
3. **Revert tests** — every `require` / `revert` path. Use `vm.expectRevert("...")`.
4. **Access-control tests** — call from unauthorized actor, expect revert.
5. **Reentrancy tests** — for any function with external calls, attempt reentrancy from a malicious receiver.
6. **Adversarial tests** — based on findings from `/audit` if available.

For state machines, also generate sequence tests:

```solidity
function test_DepositThenWithdraw() public { ... }
function test_DepositThenLiquidateThenWithdraw_reverts() public { ... }
```

## Procedure

1. Read the contract.
2. Enumerate functions and their semantic behavior.
3. For each function, generate the test set as above.
4. Generate any helper contracts needed (mock tokens, malicious receivers).
5. Run `forge test` via the MCP. Iterate on failures until all pass.

## Output

```
test/generated/<Contract>.t.sol     — main test file
test/generated/mocks/<Mock>.sol     — mock contracts
test/generated/attackers/<Bad>.sol  — adversarial contracts

forge test result: 47 passing, 0 failing, 1.2s
Coverage: 91% lines, 84% branches
```

## Notes

- Tests must be runnable (`forge test`) and pass.
- Don't generate tests for inherited OZ functions unless they're overridden.
- Don't generate redundant tests — one good revert test per branch beats five for the same branch.
