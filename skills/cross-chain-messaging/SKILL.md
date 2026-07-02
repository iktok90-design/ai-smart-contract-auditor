---
name: cross-chain-messaging
description: Detect cross-chain messaging bugs — replay protection gaps, untrusted-remote acceptance, default-config inheritance, validator-set misconfig, force-include vulnerabilities, chainId / domain-separator omissions. Activate on `_lzReceive`, `ccipReceive`, `handle` (Hyperlane), `receiveMessage`, `verifyVAA`, IRouterClient, IMailbox, EndpointV2, OApp/OFT, LayerZero / CCIP / Hyperlane / Wormhole / Axelar / Polyhedra integration code.
---

# Cross-chain messaging detection

## When this applies

- Any application built on LayerZero, CCIP, Hyperlane, Wormhole, Axelar, Polyhedra ZKBridge
- Native L1↔L2 messengers (Optimism, Arbitrum, Base, zkSync, Linea, Scroll)
- Custom bridges / message-passing layers

## Detection patterns

### `_lzReceive` accepts any remote (CRITICAL — LayerZero)
```solidity
function _lzReceive(bytes calldata srcAddr, bytes calldata payload) internal {
    // no allowlist of trusted remote
    _executeMint(payload);   // ← any chain can mint
}
```
Required: `require(trustedRemote[srcChainId] == srcAddr)`.

### CCIP `ccipReceive` callable directly (CRITICAL)
```solidity
function ccipReceive(Any2EVMMessage calldata m) external {   // ← public, no router check
    _execute(m.data);
}
```
Required: `require(msg.sender == address(router))`.

### Hyperlane `handle` without ISM check (CRITICAL)
Hyperlane's default ISM is permissive. Apps must set their own. If `handle` is called by mailbox without app-side validation, anyone can spoof messages.

### Wormhole VAA double-spend (CRITICAL)
```solidity
function complete(bytes calldata vaa) external {
    IWormhole.VM memory vm = wormhole.parseAndVerifyVM(vaa);
    _mint(vm.payload.to, vm.payload.amount);   // ← no per-VAA seen check
}
```
Required: track `usedVAAs[vm.hash] = true` after first use.

### Replay across chains (CRITICAL)
Same payload accepted on multiple destination chains. Include destination `chainId` in the signed/verified payload.

### Default DVN / ISM / config inheritance (HIGH)
Application doesn't set explicit DVN set (LayerZero V2) or ISM (Hyperlane). Default configs are often weak. Look for explicit `setSendLibrary`, `setReceiveLibrary`, `setEnforcedOptions`, `setInterchainSecurityModule`.

### chainId mapping mistakes (HIGH)
LayerZero EIDs ≠ chainIds. CCIP uses chainSelectors. Map wrong → message goes to wrong chain or stuck forever.

### Insufficient gas in `_lzSend` / `_options` (MEDIUM)
Receiver runs out of gas → message stuck (LayerZero V2 retry semantics).

### Force-include on L1↔L2 messengers (HIGH)
Anyone can force-include an L1→L2 transaction. If app assumes only sequencer can trigger certain flows, force-include breaks the assumption.

### L2→L1 withdrawal delay assumption (MEDIUM)
Optimism: 7-day challenge. Arbitrum: 7-day. App that assumes funds arrive instantly L2→L1 → invariant broken.

### Pause authority not granular (MEDIUM-HIGH)
Single pause for all routes vs per-route → over- or under-blast-radius.

### LayerZero V2 compose reentrancy (HIGH)
`_lzReceive` triggering a compose call back into `lzCompose` re-enters during the same message. Treat composed messages as reentrant calls.

### Trusted remote table update authority (HIGH)
If `setTrustedRemote` is `onlyOwner` and owner is an EOA, the bridge can be silently rerouted. See [[centralization-risk]].

## Severity rubric

| Pattern | Severity |
|---|---|
| Receive function accepts any remote | **Critical** |
| Receive function callable directly (not router/mailbox) | **Critical** |
| VAA / message not marked seen → double-spend | **Critical** |
| Cross-chain replay (no destination chainId binding) | **Critical** |
| Default ISM / DVN config (no app-side override) | **High** |
| chainId/EID/chainSelector mapping mistake | **High** |
| Compose reentrancy in LayerZero V2 | **High** |
| Force-include L1→L2 assumption | **High** |
| L2→L1 withdrawal-delay assumption | **Medium** |
| Single-key trusted-remote update authority | **High** |
| Insufficient gas in send → message stuck | **Medium** |

## Remediation patterns

- Always validate `msg.sender == router/mailbox/endpoint`.
- Always validate `srcChain` and `srcAddress` against an allowlist.
- Always include destination chainId in the verified payload.
- Mark messages seen by `(srcChain, srcAddr, nonce/hash)`.
- Configure DVN / ISM / executor explicitly per chain.
- Use chainId-aware helpers for L2 block number / time.
- Per-route pause + global emergency pause.
- Trusted-remote updates via timelock + multisig.

## False-positive notes

- Canonical OApp / OFT / OFT-Adapter from LayerZero Labs handle most of the above; verify the app didn't override unsafely.
- CCIP RouterClient / ARM are well-tested; the bug surface is in the app's `ccipReceive`.

## Related

- [[crosschain-messaging-specialist]] (subagent)
- [[signature-replay]]
- [[bridge-specialist]] (asset bridges built on top)
