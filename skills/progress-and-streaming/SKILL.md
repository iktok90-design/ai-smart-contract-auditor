---
name: progress-and-streaming
description: Convention for streaming progress on long-running audit commands. Use during /audit, /audit-deep, /audit-strict, /simulate, /exploit-chain — anything taking >10 seconds.
---

# Progress & streaming (meta-skill)

Long audits with no output feel broken. This skill defines the contract for live updates.

## When to stream

- Any command expected to take >10 seconds.
- Any command that dispatches multiple subagents in parallel.
- Any command that reads many files (>5).

## What to emit

Stream short status lines to stdout as work progresses. Each line should be self-contained — a user reading the third line shouldn't need the first two.

### Stages

```
[1/5] Inventory     scanning src/ for Solidity files
[1/5] Inventory     found 12 files (3,456 LoC), Solidity 0.8.24
[2/5] Skills        running reentrancy, access-control, oracle-manipulation, …
[2/5] Skills        18 skill checks complete (847ms)
[3/5] Specialists   dispatching: amm-specialist, attacker, defender (parallel)
[3/5] Specialists   amm-specialist:    3 findings
[3/5] Specialists   attacker:          5 findings (1 chain candidate)
[3/5] Specialists   defender:          2 missing-defense notes
[4/5] Consolidate   dedup + severity assignment
[5/5] Report        12 findings, grade C → wrote auditsentry-reports/audit-2026-05-13.md
```

### Format

- `[N/M] STAGE   message` — N is current stage, M is total
- Stage name padded to 12 chars for alignment
- Message in lowercase, terse, no "I am now ..." prose
- Numbers preferred over adjectives ("847ms" beats "quickly")

### Don't

- No spinners or animations (terminal output, not UI).
- No ANSI colors unless `process.stdout.isTTY` AND user hasn't disabled.
- No hidden state — every meaningful event gets a line.

## Cancellation

If the user interrupts (Ctrl+C / Esc), emit:
```
[!]  cancelled at stage [3/5]: dispatched specialists are still running, partial results saved to .auditsentry/partial/
```

## Implementation note

In a Claude Code slash-command context, this means: emit short text messages between tool calls. The user sees them streamed. Don't batch all updates into a final block.

## Related

- [[caching-and-incremental]] — show cache stats in stage [1/5]
- [[confidence-scoring]] — show per-skill confidence as findings come in
