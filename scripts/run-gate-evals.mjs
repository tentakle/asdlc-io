#!/usr/bin/env node
/**
 * Gate eval harness — Analyze / Converge article shape + report oracles.
 * Run via: pnpm evals:gates
 */

import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  parseAnalyzeVerdict,
  parseConvergeResult,
  validateEvidenceReport,
} from "./gate-report.mjs";

const ROOT = resolve(import.meta.dirname, "..");
const fixtures = JSON.parse(
  readFileSync(`${ROOT}/evals/gates/handoff.fixtures.json`, "utf8"),
);

let failed = 0;

function fail(id, msg) {
  failed += 1;
  console.log(`FAIL  ${id}  ${msg}`);
}

function pass(id, detail = "") {
  console.log(`PASS  ${id}${detail ? `  ${detail}` : ""}`);
}

function sections(md) {
  return [...md.matchAll(/^## (.+)$/gm)].map((m) => m[1]);
}

function defBlock(md) {
  const m = md.match(/## Definition\n\n([\s\S]*?)\n\n## /);
  return m ? m[1].trim() : "";
}

function sentenceCount(text) {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean).length;
}

function wordCount(text) {
  return (text.match(/\b\w+\b/g) || []).length;
}

console.log("ASDLC Gate Evals");
console.log("─".repeat(60));

for (const case_ of fixtures.articleShape) {
  const abs = resolve(ROOT, case_.path);
  let md;
  try {
    md = readFileSync(abs, "utf8");
  } catch {
    fail(case_.id, `missing file ${case_.path}`);
    continue;
  }
  const body = md.split(/^---$/m).slice(2).join("---") || md;
  if (case_.expectSections) {
    const got = sections(body);
    const missing = case_.expectSections.filter((s) => !got.includes(s));
    if (missing.length) {
      fail(case_.id, `missing sections: ${missing.join(", ")}`);
      continue;
    }
  }
  if (case_.expectHeadings) {
    const missing = case_.expectHeadings.filter((h) => !body.includes(h));
    if (missing.length) {
      fail(case_.id, `missing headings: ${missing.join(", ")}`);
      continue;
    }
  }
  if (case_.expectImplements && !body.includes(case_.expectImplements)) {
    fail(case_.id, `does not mention ${case_.expectImplements}`);
    continue;
  }
  if (case_.expectDefOpener) {
    const def = defBlock(body);
    if (!def.includes(case_.expectDefOpener)) {
      fail(case_.id, "definition opener missing");
      continue;
    }
    if (
      case_.maxDefSentences &&
      sentenceCount(def) > case_.maxDefSentences
    ) {
      fail(
        case_.id,
        `definition has ${sentenceCount(def)} sentences (max ${case_.maxDefSentences})`,
      );
      continue;
    }
  }
  if (case_.minWords && wordCount(body) < case_.minWords) {
    fail(case_.id, `body has ${wordCount(body)} words (min ${case_.minWords})`);
    continue;
  }
  pass(case_.id);
}

for (const case_ of fixtures.reports) {
  if (case_.kind === "analyze") {
    const verdict = parseAnalyzeVerdict(case_.text);
    if (verdict !== case_.expect.verdict) {
      fail(case_.id, `verdict ${verdict} != ${case_.expect.verdict}`);
      continue;
    }
    pass(case_.id, verdict);
    continue;
  }
  if (case_.kind === "converge") {
    const parsed = parseConvergeResult(case_.text);
    if (case_.expect.reason && parsed.reason !== case_.expect.reason) {
      fail(
        case_.id,
        `reason ${parsed.reason} != ${case_.expect.reason}`,
      );
      continue;
    }
    if (parsed.result !== case_.expect.result) {
      fail(case_.id, `result ${parsed.result} != ${case_.expect.result}`);
      continue;
    }
    pass(case_.id, parsed.result);
    continue;
  }
  if (case_.kind === "evidence") {
    const ok = validateEvidenceReport(case_.text).ok;
    if (ok !== case_.expect.ok) {
      fail(case_.id, `ok ${ok} != ${case_.expect.ok}`);
      continue;
    }
    pass(case_.id, ok ? "claim" : "rejected");
  }
}

const cliDir = mkdtempSync(join(tmpdir(), "asdlc-gates-"));
const cliScript = join(ROOT, "scripts/gate-validate.mjs");
for (const case_ of fixtures.reports) {
  const report = join(cliDir, `${case_.id}.md`);
  writeFileSync(report, case_.text);
  const kind = case_.kind;
  const run = spawnSync(process.execPath, [cliScript, kind, report], {
    encoding: "utf8",
  });
  const expectOk =
    (case_.kind === "analyze" && case_.expect.verdict === "PASS") ||
    (case_.kind === "converge" && case_.expect.result === "Converged") ||
    (case_.kind === "evidence" && case_.expect.ok === true);
  const ok = run.status === 0;
  if (ok !== expectOk) {
    fail(case_.id + "-cli", `exit ${run.status} expected ok=${expectOk}`);
    continue;
  }
  pass(case_.id + "-cli", `exit ${run.status}`);
}

console.log("─".repeat(60));
if (failed) {
  console.log(`${failed} failed`);
  process.exit(1);
}
console.log("all passed");
