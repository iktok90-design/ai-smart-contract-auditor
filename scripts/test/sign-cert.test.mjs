import { test } from "node:test";
import assert from "node:assert/strict";
import { secp256k1 } from "@noble/curves/secp256k1";
import { keccak_256 } from "@noble/hashes/sha3";
import { signCertificate, signerAddrFromPrivKey } from "../dist/sign-cert.js";

// Well-known test vector: private key 0x...01 -> this address.
const PRIV = "0x" + "00".repeat(31) + "01";
const KNOWN_ADDR = "0x7e5f4552091a69125d5dfcb7b8c2659029395bdf";

const params = {
  chainId: 80094n,
  certAddress: "0x1111111111111111111111111111111111111111",
  subject: "0x2222222222222222222222222222222222222222",
  reportHash: "0x" + "ab".repeat(32),
  ipfsCid: "QmExampleCidForTesting1234567890",
  targetName: "VulnerableVault",
  grade: 5,
  signerKey: PRIV,
};

function bytesToHex(b) {
  return "0x" + Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

test("derives the known address for private key 1", () => {
  const priv = Uint8Array.from(PRIV.slice(2).match(/../g).map((h) => parseInt(h, 16)));
  assert.equal(signerAddrFromPrivKey(priv), KNOWN_ADDR);
});

test("signing is deterministic for the same inputs", () => {
  const a = signCertificate(params);
  const b = signCertificate(params);
  assert.equal(a.issuerSig, b.issuerSig);
  assert.equal(a.digest, b.digest);
});

test("issuerSig is a 65-byte r||s||v signature", () => {
  const { issuerSig } = signCertificate(params);
  assert.match(issuerSig, /^0x[0-9a-f]{130}$/);
  const v = parseInt(issuerSig.slice(-2), 16);
  assert.ok(v === 27 || v === 28, `v should be 27/28, got ${v}`);
});

test("signature recovers to the signer (matches the contract's ecrecover path)", () => {
  const out = signCertificate(params);
  assert.equal(out.signerAddress, KNOWN_ADDR);

  const sigHex = out.issuerSig.slice(2);
  const r = sigHex.slice(0, 64);
  const s = sigHex.slice(64, 128);
  const recid = parseInt(sigHex.slice(128, 130), 16) - 27;
  const ethDigest = Uint8Array.from(out.ethDigest.slice(2).match(/../g).map((h) => parseInt(h, 16)));

  const sig = secp256k1.Signature
    .fromCompact(r + s)
    .addRecoveryBit(recid);
  const pub = sig.recoverPublicKey(ethDigest).toRawBytes(false).slice(1); // drop 0x04
  const recovered = bytesToHex(keccak_256(pub).slice(12));
  assert.equal(recovered, KNOWN_ADDR);
});

test("rejects out-of-range grades", () => {
  assert.throws(() => signCertificate({ ...params, grade: 7 }), /grade must be/);
  assert.throws(() => signCertificate({ ...params, grade: -1 }), /grade must be/);
});

test("changing any bound field changes the digest", () => {
  const base = signCertificate(params).digest;
  assert.notEqual(signCertificate({ ...params, grade: 4 }).digest, base);
  assert.notEqual(signCertificate({ ...params, targetName: "Other" }).digest, base);
  assert.notEqual(signCertificate({ ...params, subject: "0x3333333333333333333333333333333333333333" }).digest, base);
});
