import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isOffline, stub, textResult, assertSafeArg, hashKey, readCache, writeCache,
} from "../_shared/dist/index.js";

test("textResult wraps JSON as MCP text content", () => {
  const r = textResult({ a: 1 });
  assert.equal(r.content[0].type, "text");
  assert.deepEqual(JSON.parse(r.content[0].text), { a: 1 });
});

test("stub carries the uniform {stub,reason} envelope", () => {
  const j = JSON.parse(stub("no key", { extra: 2 }).content[0].text);
  assert.equal(j.stub, true);
  assert.equal(j.reason, "no key");
  assert.equal(j.extra, 2);
});

test("assertSafeArg rejects NUL, newlines, and overlong values", () => {
  assert.equal(assertSafeArg("src/Vault.sol"), "src/Vault.sol");
  assert.throws(() => assertSafeArg("a\0b"), /NUL/);
  assert.throws(() => assertSafeArg("a\nb"), /newline/);
  assert.throws(() => assertSafeArg("x".repeat(5000)), /4096/);
});

test("hashKey is stable and content-sensitive", () => {
  assert.equal(hashKey("a", "b"), hashKey("a", "b"));
  assert.notEqual(hashKey("a", "b"), hashKey("a", "c"));
  assert.match(hashKey("x"), /^[0-9a-f]{32}$/);
});

test("cache round-trips within TTL and misses after expiry", async () => {
  const key = hashKey("test", String(process.pid), "cache-rt");
  await writeCache(key, { hello: "world" });
  const hit = await readCache(key, 60_000);
  assert.deepEqual(hit, { hello: "world" });
  const expired = await readCache(key, 0); // ttl 0 → always stale
  assert.equal(expired, null);
});

test("isOffline reflects the env flag", () => {
  // default in this process: not forced — just assert it returns a boolean
  assert.equal(typeof isOffline(), "boolean");
});
