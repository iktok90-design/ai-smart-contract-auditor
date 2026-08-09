import { test } from "node:test";
import assert from "node:assert/strict";
import { normalize, pickGrade } from "../dist/parse-slither.js";
import { validateReport } from "./_helpers.mjs";

const sample = {
  results: {
    detectors: [
      {
        check: "reentrancy-eth",
        impact: "High",
        confidence: "High",
        description: "Reentrancy in Vault.withdraw()\n  External call ...",
        elements: [
          { source_mapping: { filename_short: "src/Vault.sol", filename_relative: "src/Vault.sol", lines: [42] } },
        ],
      },
      {
        check: "solc-version",
        impact: "Informational",
        confidence: "High",
        description: "Pragma is too permissive",
        elements: [{ source_mapping: { filename_short: "src/Vault.sol", lines: [1] } }],
      },
    ],
  },
};

test("maps slither impact to auditsentry severity", () => {
  const out = normalize(sample);
  assert.equal(out.findings[0].severity, "Critical"); // High -> Critical
  assert.equal(out.findings[1].severity, "Low");      // Informational -> Low
});

test("maps detector to vuln pattern", () => {
  const out = normalize(sample);
  assert.equal(out.findings[0].pattern, "reentrancy");
  assert.equal(out.findings[1].pattern, "pragma-and-addresses");
});

test("extracts path and line", () => {
  const out = normalize(sample);
  assert.equal(out.findings[0].path, "src/Vault.sol");
  assert.equal(out.findings[0].line, 42);
});

test("counts and grade reflect findings", () => {
  const out = normalize(sample);
  assert.equal(out.counts.critical, 1);
  assert.equal(out.counts.low, 1);
  assert.equal(out.grade, "F"); // any critical -> F
});

test("pickGrade thresholds", () => {
  assert.equal(pickGrade({ critical: 0, high: 0, medium: 0, low: 0, info: 0 }), "A");
  assert.equal(pickGrade({ critical: 0, high: 1, medium: 0, low: 0, info: 0 }), "C");
  assert.equal(pickGrade({ critical: 0, high: 3, medium: 0, low: 0, info: 0 }), "D");
  assert.equal(pickGrade({ critical: 0, high: 0, medium: 3, low: 0, info: 0 }), "B");
  assert.equal(pickGrade({ critical: 2, high: 0, medium: 0, low: 0, info: 0 }), "F");
});

test("unknown detector falls back to general/Info, empty input is clean A", () => {
  const out = normalize({ results: { detectors: [{ check: "some-new-detector", impact: "Whatever", confidence: "Low", elements: [] }] } });
  assert.equal(out.findings[0].pattern, "general");
  assert.equal(out.findings[0].severity, "Info");
  const empty = normalize({ results: { detectors: [] } });
  assert.equal(empty.grade, "A");
  assert.equal(empty.findings.length, 0);
});

test("output conforms to the published finding schema", () => {
  assert.ok(validateReport(normalize(sample)));
});
