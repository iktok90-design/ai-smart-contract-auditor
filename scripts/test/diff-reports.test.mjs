import { test } from "node:test";
import assert from "node:assert/strict";
import { diffReports } from "../dist/diff-reports.js";

const before = {
  grade: "F",
  counts: { critical: 1, high: 1, medium: 1, low: 0, info: 0 },
  findings: [
    { id: "REENT-001", severity: "Critical", title: "reentrancy" },
    { id: "ORACLE-002", severity: "High", title: "spot oracle" },
    { id: "GAS-010", severity: "Medium", title: "loop gas" },
  ],
};

test("identifies added, fixed, and persisting findings", () => {
  const after = {
    grade: "C",
    counts: { critical: 0, high: 1, medium: 1, low: 0, info: 0 },
    findings: [
      { id: "ORACLE-002", severity: "High", title: "spot oracle" }, // persists
      { id: "ACCESS-003", severity: "High", title: "missing onlyOwner" }, // new
      // REENT-001 and GAS-010 fixed
    ],
  };
  const d = diffReports(before, after);
  assert.deepEqual(d.added.map((f) => f.id), ["ACCESS-003"]);
  assert.deepEqual(d.fixed.map((f) => f.id).sort(), ["GAS-010", "REENT-001"]);
  assert.deepEqual(d.persisting.map((f) => f.id), ["ORACLE-002"]);
});

test("flags regression when a new high/critical appears", () => {
  const after = {
    grade: "F",
    counts: { critical: 1, high: 1, medium: 1, low: 0, info: 0 },
    findings: [
      ...before.findings,
      { id: "NEW-CRIT-009", severity: "Critical", title: "new bug" },
    ],
  };
  const d = diffReports(before, after);
  assert.equal(d.regressed, true);
  assert.equal(d.improved, false);
  assert.ok(d.summary.includes("REGRESSION"));
});

test("reports improvement when findings fixed and none introduced", () => {
  const after = {
    grade: "B",
    counts: { critical: 0, high: 0, medium: 1, low: 0, info: 0 },
    findings: [{ id: "GAS-010", severity: "Medium", title: "loop gas" }],
  };
  const d = diffReports(before, after);
  assert.equal(d.regressed, false);
  assert.equal(d.improved, true);
  assert.equal(d.countsDelta.critical, -1);
  assert.equal(d.countsDelta.high, -1);
  assert.deepEqual(d.gradeChange, { from: "F", to: "B" });
});

test("a low-severity addition is not a regression", () => {
  const after = {
    grade: "F",
    counts: { critical: 1, high: 1, medium: 1, low: 1, info: 0 },
    findings: [...before.findings, { id: "INFO-020", severity: "Low", title: "naming" }],
  };
  const d = diffReports(before, after);
  assert.equal(d.regressed, false);
});
