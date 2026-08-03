# Deploying the AuditCertificate (soulbound) contract

`AuditCertificate.sol` is a soulbound ERC-721 that mints issuer-signed audit
certificates. This runbook takes it live on Berachain. The contract, deploy
script, and the EIP-712 signer (`scripts/dist/sign-cert.js`) are complete and
tested — deploying only needs a funded key.

## Chains

| Network | chainId | RPC | Explorer |
|---|---|---|---|
| Berachain mainnet | 80094 | https://rpc.berachain.com | https://berascan.com |
| Berachain Bepolia (testnet) | 80069 | https://bepolia.rpc.berachain.com | https://bepolia.beratrail.io |

Always deploy to **Bepolia first**, mint a test certificate end-to-end, then
promote to mainnet.

## 1. Prerequisites

- A funded deployer key (BERA for gas). **Use a hardware wallet or a dedicated
  deploy key — never your everyday key.**
- An **issuer** address whose private key signs certificates (this can be the
  same as, or separate from, the admin). The issuer key lives only where
  `sign-cert` runs; it is never deployed on-chain.
- An **admin** address (multisig recommended) that can rotate the issuer and set
  the base URI.

## 2. Set env

```bash
export RUGPROOF_ADMIN=0xYourMultisig
export RUGPROOF_ISSUER=0xYourIssuerAddress
export RUGPROOF_BASE_URI="ipfs://"          # tokenURI prefix
export PRIVATE_KEY=0xDeployerKey            # or use --account / hardware wallet
```

## 3. Deploy

Testnet (recommended first):

```bash
make deploy-cert-testnet            # → forge script ... --rpc-url bepolia --broadcast --verify
```

Mainnet (after a clean testnet run):

```bash
make deploy-cert-mainnet
```

Both wrap:

```bash
FOUNDRY_PROFILE=nft forge script nft/script/Deploy.s.sol:Deploy \
  --rpc-url <rpc> --broadcast --verify
```

Record the printed `AuditCertificate deployed at: 0x...` address.

## 4. Wire the address in

Put the deployed address where `/mint-cert` and `sign-cert` read it:

```yaml
# .auditsentry.yml
certificate:
  chain_id: 80094
  address: "0xDeployedCertAddress"
```

## 5. Mint end-to-end (verify the pipeline)

```bash
node scripts/dist/sign-cert.js \
  --chain-id 80094 --cert-address 0xDeployedCertAddress \
  --subject 0xAuditedUser --report-hash 0x<keccak-of-report> \
  --ipfs-cid Qm<pinned-report-cid> --target-name "VulnerableVault" \
  --grade 5 --signer-key $RUGPROOF_ISSUER_KEY
# → { issuerSig, digest, ethDigest, signerAddress }
```

The `signerAddress` MUST equal `RUGPROOF_ISSUER`. Then call `issue(subject,
reportHash, ipfsCid, targetName, grade, issuerSig)` on the contract (via
`/mint-cert`, cast, or a frontend). The contract recomputes the same digest —
`keccak256(abi.encode(chainId, address(this), subject, reportHash, ipfsCid,
targetName, grade))` — and accepts the certificate iff the signature recovers to
the issuer.

## Security notes

- The issuer key signs *off-chain*; compromise lets an attacker mint fake
  certificates (but cannot move funds). Rotate via `setIssuer` (admin only).
- Soulbound: certificates cannot be transferred (only minted / burned to zero).
- Verify the contract on the explorer (`--verify`) so holders can audit it.
