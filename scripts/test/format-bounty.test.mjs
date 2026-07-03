import { test } from "node:test";
import assert from "node:assert/strict";
import { formatBountySubmission } from "../dist/format-bounty.js";

const finding = {
  id: "REENT-001",
  severity: "Critical",
  title: "Reentrancy in Vault.withdraw drains funds",
  path: "src/Vault.sol",
  line: 42,
  summary: "State is written after the external call, allowing reentrant withdrawal.",
  recommendation: "Apply checks-effects-interactions or a nonReentrant guard.",
};

const program = {
  protocol: "Acme Finance",
  chain: "ethereum",
  address: "0xabc0000000000000000000000000000000000001",
  platform: "immunefi",
  program_slug: "acme-fi",
  severity_map: { Critical: "critical", High: "high" },
  implementation: "0ximpl00000000000000000000000000000000beef",
};

test("maps severity per the program scale", () => {
  const s = formatBountySubmission(finding, program);
  assert.equal(s.severity, "critical");
  assert.equal(s.json.severity, "critical");
});

test("builds title, asset, and program slug", () => {
  const s = formatBountySubmission(finding, program);
  assert.equal(s.title, "[Critical] Reentrancy in Vault.withdraw drains funds");
  assert.equal(s.program_slug, "acme-fi");
  assert.equal(s.asset.address, program.address);
  assert.equal(s.asset.implementation, program.implementation);
});

test("markdown includes location, mitigation, and disclosure", () => {
  const s = formatBountySubmission(finding, program);
  assert.match(s.markdown, /src\/Vault\.sol:42/);
  assert.match(s.markdown, /Recommended mitigation/);
  assert.match(s.markdown, /nonReentrant guard/);
  assert.match(s.markdown, /disclosure/i);
});

test("embeds the PoC source when provided", () => {
  const s = formatBountySubmission(finding, program, "function test_Exploit() public { /* ... */ }");
  assert.match(s.markdown, /```solidity/);
  assert.match(s.markdown, /test_Exploit/);
});

test("falls back to a derived slug when none given", () => {
  const s = formatBountySubmission(finding, { protocol: "Foo Bar", chain: "base", address: "0x1" });
  assert.equal(s.program_slug, "foo-bar");
  assert.equal(s.platform, "immunefi");
});
