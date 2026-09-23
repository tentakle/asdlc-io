---
title: "Verify Against Spec"
longTitle: "Verify Against Spec: Analyze, Build, Converge, then Critic"
description: "Run the living Spec and PBI through Pre-Implementation Analyze, Builder work, Implementation Converge, and Adversarial Code Review."
difficulty: "Intermediate"
category: "Workflow"
estimatedMinutes: 25
tools: ["Claude Code"]
tags:
  - "Spec-Driven Development"
  - "Quality Gates"
  - "Verification"
  - "Context Engineering"
status: "Experimental"
lastUpdated: 2026-09-23
agentPrompt: "You are running Verify Against Spec. Resolve the active Spec and PBI. Run Pre-Implementation Analyze (read-only). On PASS, implement. Run Implementation Converge (matrix). On Converged, hand off to Critic. Do not skip gates without an explicit waiver on the PBI."
relatedIds:
  - "practices/pre-implementation-analyze"
  - "practices/implementation-converge"
  - "practices/adversarial-code-review"
  - "patterns/context-gates"
  - "patterns/the-spec"
  - "patterns/the-pbi"
  - "recipes/spec-engineer"
  - "recipes/critic"
  - "recipes/write-agents-md"
  - "practices/evidence-before-claims"
  - "concepts/spec-driven-development"
prerequisites:
  - "A living Spec and an active PBI"
  - "patterns/the-spec"
  - "patterns/the-pbi"
  - "practices/adversarial-code-review"
  - "A project toolchain command that proves the change"
---

## Overview

> [!WARNING]
> **Stability Warning**
> This recipe is Experimental. Steps and report shapes may change without a deprecation cycle. Prefer the linked Live practices and patterns when you need a settled contract.

**Verify Against Spec** is the end-to-end handoff that keeps a living [Spec](/patterns/the-spec) and [PBI](/patterns/the-pbi) connected from planning through review. It sequences four gates (Analyze and Converge are Proposed; this recipe is Experimental):

1. **[Pre-Implementation Analyze](/practices/pre-implementation-analyze)** — read-only go/no-go before build
2. **Builder** — implement the PBI delta against the Spec Contract
3. **[Implementation Converge](/practices/implementation-converge)** — scenario-to-evidence completeness
4. **[Adversarial Code Review](/practices/adversarial-code-review)** — Critic, report-only

This recipe operationalizes [Context Gates](/patterns/context-gates) as one path while Spec and PBI remain the source of truth.

## When to Use

- A non-trivial PBI is ready for implementation under a living Spec
- You need a deterministic stop before coding and a completeness check before Critic
- The project already uses Lead / Builder / Critic roles (or equivalent)

**Skip when:**
- Typo, dependency pin, or rename with no Contract scenarios — edit that scope and run one proving command. Do not run this recipe.
- Pure exploration before Spec exists — start with Spec Engineer or Adversarial Requirement Review

## How It Works

### Phase 1 — Resolve artifacts

Locate:

- Living Spec: `specs/<domain>/spec.md` (or project template path)
- Active PBI: `tasks/PBI-*.md` or the head item from `tasks/README.md`
- Constitution: `AGENTS.md` / `CLAUDE.md` only as needed for Scope vs NEVER/ASK

If Spec or PBI is missing for non-trivial work, stop and create them first ([Spec Engineer](/recipes/spec-engineer), [PBI Authoring](/practices/pbi-authoring)).

### Phase 2 — Pre-Implementation Analyze

Follow [Pre-Implementation Analyze](/practices/pre-implementation-analyze). Emit Gaps, Contract quality, Consistency, and **PASS** or **FAIL**.

Hard rules:

- Read-only — do not edit Spec, PBI, or product code in this phase
- On **FAIL**, do not implement until PASS or an explicit waiver on the PBI
- Prefer false FAIL when unsure

### Phase 3 — Build

Implement only the PBI Scope against the Spec Contract. Prefer Test-Driven Development for Contract scenarios. Same-commit Spec updates when behavior changes.

Before any success, completion, or “done” sentence, name one proving command from the constitution Toolchain (or a Contract scenario). Run it in this session. Write the claim only in this shape: `Ran <command> → exit <code>. Therefore <claim>.` Do not reuse output from an earlier turn. [Evidence Before Claims](/practices/evidence-before-claims) remains **Proposed**.

Do not treat this phase as Critic or as Converge.

### Phase 4 — Implementation Converge

Follow [Implementation Converge](/practices/implementation-converge). Publish the scenario-to-evidence matrix.

- **Converged** — every required scenario has re-runnable evidence
- **Gaps** — append concrete checkboxes to the PBI; do not claim done
- **FAIL** — matrix cannot be trusted; return to Spec/PBI work

Do not edit product code in this phase. Do not drop Spec scenarios to green the matrix.

### Phase 5 — Critic

Only after **Converged** (or a recorded skip) run [Adversarial Code Review](/recipes/critic). Critic remains report-only: **PASS** / **PASS WITH NOTES** / **FAIL**. Critic does not append PBI tasks—that is Converge.

## Report shapes

Judge requirements only against the Spec Contract. Do not invent a second Definition of Done outside the Spec.

The practice articles are **Proposed** (open RFC, not in the published skill bundle until consensus). Emit these shapes from this recipe so the handoff still runs:

```markdown
# Pre-Implementation Analyze — <PBI id or path>

## Gaps
- [ ] …

## Contract quality
- [ ] Scenarios present and binary
- [ ] DoD verifiable
- [ ] Ambiguity cleared or quantified

## Consistency
- Conflict: …
- Orphan: …
- Missing: …

## Verdict: PASS | FAIL
```

```markdown
# Implementation Converge — <PBI id>

| Scenario | Evidence | Status |
|----------|----------|--------|
| … | `tests/…::test_name` / command excerpt | Covered |

## Appended PBI tasks
- [ ] …

## Result: Converged | Gaps | FAIL
```

Read-only on Analyze: do not edit Spec, PBI, or product code. On Converge, append PBI tasks when evidence is missing. Do not drop Spec scenarios to green the matrix. A Converged result without the table is not Converged.

On an ASDLC site checkout, check a saved report:

```bash
node scripts/gate-validate.mjs analyze report.md
node scripts/gate-validate.mjs converge report.md
node scripts/gate-validate.mjs evidence report.md
```

Exit 0 means **PASS**, **Converged**, or a claim of the form `Ran <command> → exit <code>. Therefore <claim>.` whose command the checker re-runs to that same exit code. Exit 1 means the report is FAIL, Gaps, missing that claim, names a different exit code, or is malformed. Other repositories use the same shapes. Evidence Before Claims stays **Proposed**; this check is part of the Experimental recipe.

## Common Mistakes

### Skipping Analyze Because the Spec “Looks Fine”

**Problem:** Builder invents intent at the keyboard; Intent Debt starts before the first commit.

**Solution:** Run Analyze. Prefer false FAIL.

### Letting Critic Own Completeness

**Problem:** The Critic appends tasks or “fixes” gaps and loses adversarial separation.

**Solution:** Converge owns the matrix and PBI appends. Critic judges quality only.

### Claiming Done Without a Matrix

**Problem:** False completeness.

**Solution:** No Converged without published evidence per Contract scenario.

## Related

- **[Pre-Implementation Analyze](/practices/pre-implementation-analyze)** / **[Implementation Converge](/practices/implementation-converge)**
- **[Evidence Before Claims](/practices/evidence-before-claims)** (Proposed) — the proving sentence this recipe checks
- **[Context Gates](/patterns/context-gates)** — structural gate model this recipe sequences
- **[Spec Engineer](/recipes/spec-engineer)** / **[Critic](/recipes/critic)** — adjacent recipes for Spec authoring and review
