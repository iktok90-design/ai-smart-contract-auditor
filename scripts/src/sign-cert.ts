#!/usr/bin/env node
/**
 * Local NFT cert issuer-signer. Produces an EIP-712-style signature
 * that AuditCertificate.issue() will accept.
 *
 * No backend required — the signer key is supplied locally.
 *
 * Hash format (matches nft/src/AuditCertificate.sol::issue):
 *   digest = keccak256(abi.encode(
 *     chainId, certAddress, subject, reportHash, ipfsCid, targetName, grade
 *   ))
 *   ethDigest = keccak256("\x19Ethereum Signed Message:\n32" || digest)
 *   sig = ecdsa(signerPrivateKey, ethDigest)  // 65 bytes (r||s||v)
 *
 * Usage:
 *   sign-cert \
 *     --chain-id 80094 \
 *     --cert-address 0xCERT... \
 *     --subject 0xUSER... \
 *     --report-hash 0x... \
 *     --ipfs-cid QmABC... \
 *     --target-name "VulnerableVault" \
 *     --grade 5 \
 *     --signer-key 0xPRIV...        # or env: RUGPROOF_SIGNER_KEY
 *
 * Output: { issuerSig: "0x...", digest: "0x..." }
 */

import { secp256k1 } from "@noble/curves/secp256k1";
import { keccak_256 } from "@noble/hashes/sha3";
import { pathToFileURL } from "node:url";

function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const k = a.slice(2);
      const v = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : "true";
      out[k] = v;
    }
  }
  return out;
}

function hexToBytes(hex: string): Uint8Array {
  const h = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (h.length % 2) throw new Error("odd-length hex");
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.substr(i * 2, 2), 16);
  return out;
}

function bytesToHex(b: Uint8Array): string {
  return "0x" + Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

function uint256ToBytes(n: bigint): Uint8Array {
  const out = new Uint8Array(32);
  let v = n;
  for (let i = 31; i >= 0; i--) { out[i] = Number(v & 0xffn); v >>= 8n; }
  return out;
}

function addressToBytes(addr: string): Uint8Array {
  const h = (addr.startsWith("0x") ? addr.slice(2) : addr).toLowerCase();
  if (h.length !== 40) throw new Error(`invalid address: ${addr}`);
  const out = new Uint8Array(32);   // ABI-encoded address is left-padded to 32
  for (let i = 0; i < 20; i++) out[12 + i] = parseInt(h.substr(i * 2, 2), 16);
  return out;
}

function bytes32ToBytes(hex: string): Uint8Array {
  const b = hexToBytes(hex);
  if (b.length !== 32) throw new Error(`bytes32 must be 32 bytes, got ${b.length}`);
  return b;
}

/// ABI-encode a dynamic string (per Solidity abi.encode):
///   - head pointer (uint256, written into the head section)
///   - length (uint256)
///   - data padded to 32-byte boundary
function abiEncodeString(s: string): { head: Uint8Array; tail: Uint8Array } {
  const enc = new TextEncoder().encode(s);
  const padLen = Math.ceil(enc.length / 32) * 32;
  const tail = new Uint8Array(32 + padLen);
  // length
  const lenBytes = uint256ToBytes(BigInt(enc.length));
  tail.set(lenBytes, 0);
  tail.set(enc, 32);
  return { head: uint256ToBytes(0n), tail };   // head value placeholder; caller patches offset
}

function concat(...arrs: Uint8Array[]): Uint8Array {
  const total = arrs.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const a of arrs) { out.set(a, off); off += a.length; }
  return out;
}

/**
 * Encode the AuditCertificate.issue digest pre-image using abi.encode semantics.
 * Solidity:
 *   keccak256(abi.encode(chainId, certAddress, subject, reportHash, ipfsCid, targetName, grade))
 * Static types: uint256, address, address, bytes32, ?, ?, uint8
 * Dynamic types (string): ipfsCid, targetName
 *
 * abi.encode layout:
 *   [chainId 32] [certAddr 32] [subject 32] [reportHash 32] [offset_ipfs 32] [offset_name 32] [grade 32]
 *   [ipfs_len 32] [ipfs_data padded]
 *   [name_len 32] [name_data padded]
 */
export function buildDigestPreimage(
  chainId: bigint,
  certAddr: string,
  subject: string,
  reportHash: string,
  ipfsCid: string,
  targetName: string,
  grade: number,
): Uint8Array {
  const headSize = 7 * 32;
  const ipfs = abiEncodeString(ipfsCid);
  const name = abiEncodeString(targetName);

  const ipfsOffset = BigInt(headSize);
  const nameOffset = ipfsOffset + BigInt(ipfs.tail.length);

  return concat(
    uint256ToBytes(chainId),
    addressToBytes(certAddr),
    addressToBytes(subject),
    bytes32ToBytes(reportHash),
    uint256ToBytes(ipfsOffset),
    uint256ToBytes(nameOffset),
    uint256ToBytes(BigInt(grade)),
    ipfs.tail,
    name.tail,
  );
}

export interface CertParams {
  chainId: bigint;
  certAddress: string;
  subject: string;
  reportHash: string;
  ipfsCid: string;
  targetName: string;
  grade: number;
  signerKey: string;
}

export interface SignedCert {
  digest: string;
  ethDigest: string;
  issuerSig: string;
  signerAddress: string;
  args: {
    chainId: string;
    certAddress: string;
    subject: string;
    reportHash: string;
    ipfsCid: string;
    targetName: string;
    grade: number;
  };
}

/**
 * Produce the issuer signature AuditCertificate.issue() will accept. Pure: no
 * argv / env / process side effects, so it is unit-testable and reusable.
 */
export function signCertificate(p: CertParams): SignedCert {
  if (p.grade < 0 || p.grade > 6) throw new Error("grade must be 0-6 (0=A+, 6=F)");

  const preimage = buildDigestPreimage(
    p.chainId, p.certAddress, p.subject, p.reportHash, p.ipfsCid, p.targetName, p.grade,
  );
  const digest = keccak_256(preimage);

  // Ethereum Signed Message prefix (matches AuditCertificate.sol's recover())
  const prefix = new TextEncoder().encode("\x19Ethereum Signed Message:\n32");
  const ethDigest = keccak_256(concat(prefix, digest));

  const privKey = hexToBytes(p.signerKey);
  const sig = secp256k1.sign(ethDigest, privKey);
  const sigBytes = sig.toCompactRawBytes();   // 64 bytes (r||s)
  const v = sig.recovery !== undefined ? 27 + sig.recovery : 27;
  const sig65 = new Uint8Array(65);
  sig65.set(sigBytes, 0);
  sig65[64] = v;

  return {
    digest: bytesToHex(digest),
    ethDigest: bytesToHex(ethDigest),
    issuerSig: bytesToHex(sig65),
    signerAddress: signerAddrFromPrivKey(privKey),
    args: {
      chainId: p.chainId.toString(),
      certAddress: p.certAddress,
      subject: p.subject,
      reportHash: p.reportHash,
      ipfsCid: p.ipfsCid,
      targetName: p.targetName,
      grade: p.grade,
    },
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const required = ["chain-id", "cert-address", "subject", "report-hash", "ipfs-cid", "target-name", "grade"];
  for (const r of required) {
    if (!args[r]) {
      console.error(`error: --${r} is required`);
      console.error("see header comment in scripts/src/sign-cert.ts for full usage");
      process.exit(1);
    }
  }

  const signerKey = args["signer-key"] ?? process.env.RUGPROOF_SIGNER_KEY;
  if (!signerKey) {
    console.error("error: --signer-key or RUGPROOF_SIGNER_KEY required");
    process.exit(1);
  }

  const grade = parseInt(args.grade, 10);
  if (grade < 0 || grade > 6) {
    console.error("error: grade must be 0-6 (0=A+, 6=F)");
    process.exit(1);
  }

  const out = signCertificate({
    chainId: BigInt(args["chain-id"]),
    certAddress: args["cert-address"],
    subject: args.subject,
    reportHash: args["report-hash"],
    ipfsCid: args["ipfs-cid"],
    targetName: args["target-name"],
    grade,
    signerKey,
  });
  console.log(JSON.stringify(out, null, 2));
}

export function signerAddrFromPrivKey(privKey: Uint8Array): string {
  const pubKeyUncompressed = secp256k1.getPublicKey(privKey, false); // 65 bytes incl. 0x04 prefix
  const hash = keccak_256(pubKeyUncompressed.slice(1));
  return bytesToHex(hash.slice(12)).toLowerCase();
}

const isEntry = !!process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isEntry) {
  main().catch((err) => { console.error("sign-cert failed:", err); process.exit(1); });
}
