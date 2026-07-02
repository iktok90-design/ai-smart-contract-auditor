---
name: ve-lock-governance
description: Detect vote-escrow (ve) governance manipulation — Curve veCRV, Velodrome/Aerodrome veNFT, Balancer veBAL, and gauge/bribe markets. Activate whenever code reads voting power from a lock balance, computes gauge weights, distributes bribes/incentives, snapshots votes, or lets locks be created/extended/merged/split/transferred — especially when vote weight is read live rather than at proposal-creation block.
---

# Vote-escrow lock governance detection

## When this applies

Trigger on any of:

- Locking tokens for time-decayed voting power (`create_lock`, `increase_amount`, `increase_unlock_time`)
- Reading `balanceOf`/`balanceOfNFT`/`votingPower` from a ve contract during a vote or weight calc
- Gauge-weight voting, gauge controller `vote_for_gauge_weights`, emission direction
- Bribe / incentive markets (Votium, Hidden Hand, Velodrome `BribeVotingReward`)
- veNFT transfer, `merge`, `split`, `withdraw`, `delegate`
- Proposal systems that read voting power without a snapshot block

## Detection patterns

### Live vote weight, no snapshot (HIGH / CRITICAL)
```solidity
function castVote(uint256 proposalId, bool support) external {
    uint256 weight = ve.balanceOf(msg.sender);   // ← read NOW, not at proposal start
    proposals[proposalId].votes[support] += weight;
}
```
**Signal:** voting power read at vote time enables flash-lock: borrow, lock, vote, then exit if `withdraw` allowed same block, or vote with freshly minted power. Snapshot at proposal-creation block (`getPastVotes`).

### Gauge-weight manipulation (HIGH)
Last-block vote stuffing before the weekly checkpoint redirects emissions. If gauge weights are read at the instant of `checkpoint_gauge` with no time-weighting, a single-block max vote captures a full epoch of emissions (Curve gauge-war griefing class).
**Signal:** emission direction determined by instantaneous weight, not a bias-weighted moving average.

### veNFT merge / split double-vote (HIGH)
```solidity
function merge(uint256 from, uint256 to) external { ... }   // does it clear `voted[from]`?
```
**Signal:** Velodrome-class finding — `split`/`merge` not resetting the per-NFT `voted` flag or per-epoch vote accounting lets one underlying balance vote twice in an epoch. Also check `transferFrom` mid-epoch carrying voting power to a non-voted recipient.

### Lock-decay / max-lock precision (MEDIUM)
Linear-decay `bias - slope * (t - t0)` underflowing past expiry, or assuming `MAXTIME` lock when `unlock_time` was rounded down to the week. Off-by-one-week rounding inflates or deflates power at epoch boundaries.

### Bribe-market timing (MEDIUM)
Claiming bribes for an epoch you voted in, then re-voting next epoch with the same balance, or claiming on a transferred veNFT — verify bribe accounting is keyed to (tokenId, epoch) and frozen at the vote.

## Severity rubric

| Pattern | Severity | Notes |
|---|---|---|
| Flash-lock vote with same-block exit | **Critical** | Direct governance capture |
| Live (un-snapshotted) vote weight | **High** | Borrowed-power voting |
| merge/split/transfer double-vote | **High** | Velodrome-class veNFT bug |
| Last-block gauge stuffing | **High** | Emission theft per epoch |
| Decay/rounding precision at week boundary | **Medium** | Bounded mis-weighting |
| Bribe claim re-use across epochs | **Medium** | Incentive leakage |

## Remediation patterns

1. **Snapshot voting power** at proposal-creation block via `ERC20Votes.getPastVotes` / checkpoint history — never `balanceOf` at vote time.
2. **Time-bias gauge weights** (Curve's `points_weight` slope/bias with future-epoch bias) so a single block cannot dominate an epoch.
3. **Reset per-NFT vote state on `merge`/`split`/`transfer`** and forbid transfer of a veNFT that has voted in the current epoch (Velodrome `voted` lock).
4. **Key bribe accounting to (tokenId, epoch)** and freeze the balance used at vote time.
5. **Disallow withdraw before unlock** and round `unlock_time` consistently (floor to week) everywhere.

## False-positive notes

- Snapshot-based systems (`ERC20Votes`, Compound `getPriorVotes`) that already pin to a past block are safe — don't flag live `balanceOf` used only for *display*.
- A non-transferable, non-mergeable ve lock with no early withdraw materially narrows the surface; note but don't escalate.

## Related

- [[flash-loan-attacks]] — flash-borrowed capital funds the flash-lock vote
- [[signature-replay]] — delegated/gasless vote signatures need nonce + epoch binding
- [[centralization-risk]] — gauge controller / emission admin keys
