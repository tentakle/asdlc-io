#!/usr/bin/env node
/**
 * Validate one Analyze, Converge, or evidence-claim report.
 * Usage: node scripts/gate-validate.mjs <analyze|converge|evidence> <report.md>
 * Exit 0 when the report is PASS, Converged, or a claim whose command
 * re-runs to the named exit code. Exit 1 otherwise.
 */

import { readFileSync } from "node:fs";
import {
  validateAnalyzeReport,
  validateConvergeReport,
  validateEvidenceReport,
} from "./gate-report.mjs";

const [kind, file] = process.argv.slice(2);
if ((kind !== "analyze" && kind !== "converge" && kind !== "evidence") || !file) {
  console.error(
    "usage: node scripts/gate-validate.mjs <analyze|converge|evidence> <report.md>",
  );
  process.exit(2);
}

const text = readFileSync(file, "utf8");
const result =
  kind === "analyze"
    ? validateAnalyzeReport(text)
    : kind === "converge"
      ? validateConvergeReport(text)
      : validateEvidenceReport(text);

if (!result.ok) {
  const detail = result.verdict ?? result.result ?? "malformed";
  if (result.observed != null) {
    console.error(`${detail} observed ${result.observed} claimed ${result.claimed}`);
  } else {
    console.error(detail);
  }
  process.exit(1);
}

console.log(result.verdict ?? result.result);
