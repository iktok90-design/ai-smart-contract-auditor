import { test } from "node:test";
import assert from "node:assert/strict";
import { normalize, pickGrade } from "../dist/parse-mythril.js";
import { validateReport } from "./_helpers.mjs";

const sample = {
  issues: [
    {
      "swc-id": "107",
      severity: "High",
      title: "State change after external call",
      description: { head: "Reentrancy", tail: "..." },
      filename: "Vault.sol",
      lineno: 88,
      function: "withdraw",
    },
    {
      "swc-id": "SWC-101",
      severity: "Medium",
      title: "Integer overflow",
      description: "Arithmetic overflow possible",
      filename: "Vault.sol",
      lineno: 12,
    },
  ],
};

test("maps mythril severity to auditsentry severity", () => {
  const out = normalize(sample);
  assert.equal(out.findings[0].severity, "Critical"); // High -> Critical
  assert.equal(out.findings[1].severity, "High");     // Medium -> High
});

test("maps SWC id to vuln pattern (with or without SWC- prefix)", () => {
  const out = normalize(sample);
  assert.equal(out.findings[0].pattern, "reentrancy");      // SWC-107
  assert.equal(out.findings[1].pattern, "integer-issues");  // SWC-101
  assert.ok(out.findings[0].id.startsWith("MYTHRIL-SWC-107"));
  assert.ok(out.findings[1].id.startsWith("MYTHRIL-SWC-101"));
});

test("extracts filename and lineno", () => {
  const out = normalize(sample);
  assert.equal(out.findings[0].path, "Vault.sol");
  assert.equal(out.findings[0].line, 88);
});

test("grade reflects severity counts", () => {
  const out = normalize(sample);
  assert.equal(out.counts.critical, 1);
  assert.equal(out.counts.high, 1);
  assert.equal(out.grade, "F");
});

test("pickGrade thresholds", () => {
  assert.equal(pickGrade({ critical: 0, high: 0, medium: 1, low: 0, info: 0 }), "A");
  assert.equal(pickGrade({ critical: 0, high: 0, medium: 3, low: 0, info: 0 }), "B");
});

test("output conforms to the published finding schema", () => {
  assert.ok(validateReport(normalize(sample)));
});
