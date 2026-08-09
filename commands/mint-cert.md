---
description: Mint a soulbound Audit Certificate NFT on Berachain (or other supported chain) for a completed audit.
argument-hint: "[--chain berachain] [--ipfs-pin]"
allowed-tools: Read, Bash, mcp__block-explorer__*
---

# /mint-cert — mint an Audit Certificate NFT

Mints a soulbound NFT recording the completed audit. The token's metadata bundle (audit JSON + Markdown report + PNG card) is pinned to IPFS.

Default chain: **Berachain** (the launch ecosystem).

## Prerequisites

- A completed `/audit` (with results saved to `auditsentry-reports/`)
- A **deployed `AuditCertificate` contract** — see `nft/DEPLOY.md` for the
  Berachain runbook. Record its address in `.auditsentry.yml`:
  ```yaml
  certificate:
    chain_id: 80094            # Berachain mainnet (Bepolia testnet: 80069)
    address: "0xDeployedCertAddress"
  ```
- Wallet env: `RUGPROOF_SUBJECT_PK` (the subject's signing key) and `RUGPROOF_SUBJECT_ADDR`
- An **issuer signature**: produce it locally with the bundled signer (no backend
  needed) — `node scripts/dist/sign-cert.js --chain-id <id> --cert-address <addr>
  --subject <user> --report-hash <0x…> --ipfs-cid <Qm…> --target-name <name>
  --grade <0-6> --signer-key $RUGPROOF_ISSUER_KEY`. Its `signerAddress` must match
  the contract's configured issuer.
- IPFS pinning credentials (Pinata / Web3.Storage / Filecoin) if using `--ipfs-pin`

## Procedure

1. **Bundle the audit.** Collect:
   - `findings.json`
   - `audit.md` rendered report
   - `audit-card.png` PNG card
   Hash all three together → `reportHash` (sha256).

2. **Pin to IPFS.** If `--ipfs-pin`, upload the bundle. Capture CID. Otherwise expect `RUGPROOF_BUNDLE_CID` env var.

3. **Request issuer signature.** POST the bundle metadata + reportHash to AuditSentry's signer:
   ```bash
   curl -X POST https://api.iktok90-design.github.io/AuditSentry/v1/issue-cert \
        -H "content-type: application/json" \
        -d '{ "subject": "0x...", "reportHash": "0x...", "ipfsCid": "Qm...", "targetName": "MyVault", "grade": 5, "chainId": 80094 }'
   ```
   Returns `{ "issuerSig": "0x..." }`.

4. **Submit the mint tx.** Call `AuditCertificate.issue(subject, reportHash, ipfsCid, targetName, grade, issuerSig)` on the deployment for the target chain.

5. **Output the cert.**
   ```
   ✓ minted AuditSentry Audit Certificate
     chain:       berachain
     contract:    0xCERT...
     tokenId:     42
     subject:     0xUSER...
     ipfs:        ipfs://QmExample...
     opensea:     https://opensea.io/...   (or beratrail equivalent)
     image:       https://gateway.ipfs.io/ipfs/QmExample.../card.png
   ```

## Why soulbound

The cert is bound to the audited contract owner / repo maintainer. Transferring it would amount to selling a security claim, which would be fraud. Soulbound prevents secondary-market drift.

## Notes

- The mint costs gas (~150K). On Berachain that's fractions of a cent.
- AuditSentry's issuer signer is a multi-sig — sigs are countersigned only after AuditSentry has independently re-verified the audit JSON.
- Cert grade is permanent. Re-audit produces a new cert; old certs aren't burned (they're history).
- `RUGPROOF_OFFLINE=1` blocks this command.
