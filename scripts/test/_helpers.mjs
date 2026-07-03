// Zero-dependency, offline validation of a AuditSentry report against
// schemas/finding.schema.json. Not a full JSON-Schema engine — it checks the
// constraints that actually matter for consumers (required keys, enums, types)
// so the parsers can't silently drift from the published shape.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const SCHEMA = JSON.parse(
  readFileSync(resolve(here, "..", "..", "schemas", "finding.schema.json"), "utf-8"),
);

const SEVERITIES = SCHEMA.$defs.finding.properties.severity.enum;
const GRADES = SCHEMA.properties.grade.enum;
const COUNT_KEYS = Object.keys(SCHEMA.properties.counts.properties);
const FINDING_REQUIRED = SCHEMA.$defs.finding.required;
const TOP_REQUIRED = SCHEMA.required;

/** Throw with a clear message if `report` violates the schema. */
export function validateReport(report) {
  for (const k of TOP_REQUIRED) {
    if (!(k in report)) throw new Error(`report missing required key: ${k}`);
  }
  for (const k of COUNT_KEYS) {
    if (typeof report.counts[k] !== "number") {
      throw new Error(`counts.${k} must be a number`);
    }
  }
  if (!GRADES.includes(report.grade)) {
    throw new Error(`grade "${report.grade}" not in ${GRADES.join(",")}`);
  }
  if (!Array.isArray(report.findings)) throw new Error("findings must be an array");
  report.findings.forEach((f, i) => {
    for (const k of FINDING_REQUIRED) {
      if (!(k in f)) throw new Error(`finding[${i}] missing required key: ${k}`);
    }
    if (!SEVERITIES.includes(f.severity)) {
      throw new Error(`finding[${i}].severity "${f.severity}" not in ${SEVERITIES.join(",")}`);
    }
    if (typeof f.line !== "number") throw new Error(`finding[${i}].line must be a number`);
  });
  return true;
}
