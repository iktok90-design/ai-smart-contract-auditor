import { test } from "node:test";
import assert from "node:assert/strict";
import { scoreBenchmark } from "../dist/benchmark.js";

const expected = {
  VaultA: { expected_patterns: ["reentrancy", "access-control"] },
  OracleB: { expected_patterns: ["oracle-manipulation", "flash-loan-attacks"] },
};

test("perfect detection scores 100% recall and precision", () => {
  const r = scoreBenchmark(expected, {
    VaultA: ["reentrancy", "access-control"],
    OracleB: ["oracle-manipulation", "flash-loan-attacks"],
  });
  assert.equal(r.aggregate.recall, 1);
  assert.equal(r.aggregate.precision, 1);
  assert.equal(r.aggregate.f1, 1);
});

test("a miss lowers recall; a false positive lowers precision", () => {
  const r = scoreBenchmark(expected, {
    VaultA: ["reentrancy", "gas"],          // missed access-control, extra gas (FP)
    OracleB: ["oracle-manipulation", "flash-loan-attacks"],
  });
  const vault = r.perTarget.find((t) => t.target === "VaultA");
  assert.deepEqual(vault.missed, ["access-control"]);
  assert.deepEqual(vault.falsePositives, ["gas"]);
  assert.equal(vault.recall, 0.5);
  assert.equal(vault.precision, 0.5);
});

test("empty findings → zero recall", () => {
  const r = scoreBenchmark(expected, { VaultA: [], OracleB: [] });
  assert.equal(r.aggregate.recall, 0);
});

test("aggregate averages across targets", () => {
  const r = scoreBenchmark(expected, {
    VaultA: ["reentrancy", "access-control"], // recall 1
    OracleB: ["oracle-manipulation"],         // recall 0.5
  });
  assert.equal(r.aggregate.recall, 0.75);
});
