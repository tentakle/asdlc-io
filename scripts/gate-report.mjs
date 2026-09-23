/** Shared oracles for Analyze, Converge, and evidence-claim reports. */

import { spawnSync } from "node:child_process";

export function parseAnalyzeVerdict(text) {
  const m = text.match(/##\s*Verdict:\s*(PASS|FAIL)\b/i);
  return m ? m[1].toUpperCase() : null;
}

export function parseConvergeResult(text) {
  const hasMatrix =
    /\|[^\n]*Scenario[^\n]*\|[^\n]*Evidence[^\n]*\|/i.test(text) &&
    /\|[^\n]*---/.test(text);
  const m = text.match(/##\s*Result:\s*(Converged|Gaps|FAIL)\b/i);
  if (!m) return { result: null, hasMatrix };
  const result = m[1];
  if (result === "Converged" && !hasMatrix) {
    return { result: "FAIL", hasMatrix, reason: "missing-matrix" };
  }
  return { result, hasMatrix };
}

const ANALYZE_SECTIONS = ["## Gaps", "## Contract quality", "## Consistency"];

export function validateAnalyzeReport(text) {
  const missing = ANALYZE_SECTIONS.filter((section) => !text.includes(section));
  const verdict = parseAnalyzeVerdict(text);
  if (missing.length || !verdict) {
    return { ok: false, verdict, missing };
  }
  return { ok: verdict === "PASS", verdict, missing };
}

export function validateConvergeReport(text) {
  const parsed = parseConvergeResult(text);
  return { ok: parsed.result === "Converged", ...parsed };
}

const EVIDENCE_CLAIM =
  /Ran\s+(\S.*?)\s→\s+exit\s+(\d+)\.\s+Therefore\s+\S[^\n]*\./;

export function parseEvidenceClaim(text) {
  const m = text.match(EVIDENCE_CLAIM);
  if (!m) return null;
  return { command: m[1].trim(), code: Number(m[2]) };
}

export function runEvidenceCommand(command) {
  const run = spawnSync(command, {
    shell: true,
    encoding: "utf8",
    timeout: 120_000,
  });
  return run.status;
}

export function validateEvidenceReport(text, run = runEvidenceCommand) {
  const parsed = parseEvidenceClaim(text);
  if (!parsed) return { ok: false, verdict: null };
  const observed = run(parsed.command);
  const ok = observed === parsed.code;
  return {
    ok,
    verdict: ok ? "claim" : "exit-mismatch",
    observed,
    claimed: parsed.code,
  };
}
