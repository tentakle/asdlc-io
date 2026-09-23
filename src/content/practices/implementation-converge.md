---
title: "Implementation Converge"
longTitle: "Implementation Converge: Completeness Check Against Spec Contract After Build"
description: "The process of mapping Contract scenarios to evidence after implementation, appending PBI tasks or failing—before Critic."
tags:
  - Spec-Driven Development
  - Quality Gates
  - Practices
  - Verification
  - AI Agents
status: "Proposed"
relatedIds:
  - "patterns/context-gates"
  - "patterns/the-spec"
  - "patterns/the-pbi"
  - "patterns/adversarial-code-review"
  - "practices/pre-implementation-analyze"
  - "practices/adversarial-code-review"
  - "practices/living-specs"
  - "concepts/test-driven-development"
  - "concepts/spec-driven-development"
  - "recipes/verify-against-spec"
  - "practices/evidence-before-claims"
lastUpdated: 2026-09-23
steps:
  - name: "Load Contract and Diff"
    text: "Open Spec Contract scenarios and PBI Verification. Collect the implementation diff or touched paths for this PBI."
  - name: "Build Coverage Matrix"
    text: "For each Contract scenario, record re-runnable evidence or mark Missing or Partial."
  - name: "Append Tasks or FAIL"
    text: "When evidence is missing, append concrete follow-up checkboxes to the PBI. Do not edit product code in this practice."
  - name: "Declare Converged or Not"
    text: "Emit Converged only when every required scenario has evidence. Otherwise Gaps or FAIL. Never claim green without the matrix."
  - name: "Hand Off to Critic"
    text: "After Converged—or an explicit skip recorded on the PBI—run Adversarial Code Review for quality, not for task authoring."
references:
  - type: website
    title: "Understanding Spec-Driven Development: Kiro, spec-kit, and Tessl"
    author: "Birgitta Böckeler"
    url: "https://martinfowler.com/articles/exploring-gen-ai/sdd-3-tools.html"
    published: 2025-10-15
    accessed: 2026-09-22
    annotation: "Discusses verify-completeness after implement. This practice keeps the living Spec Contract as source of truth and separates completeness from Critic quality review."
  - type: website
    title: "From Technical Debt to Cognitive and Intent Debt"
    author: "Margaret-Anne Storey"
    url: "https://arxiv.org/abs/2603.22106"
    published: 2026-03-23
    accessed: 2026-09-22
    annotation: "Intent Debt grows when requirements lose traceable links to implementation—Converge exists to keep that chain auditable before review."
---

## Definition

**Implementation Converge** is the process of verifying that Builder work **covers** the living Spec **Contract** after implementation and before [Adversarial Code Review](/practices/adversarial-code-review). You build a scenario-to-evidence matrix and finish in one of three states: **Converged**, **Gaps** (with follow-up tasks appended to the PBI), or **FAIL** when the matrix cannot be trusted.

The outcome is completeness—not architectural judgment—and Critic agents stay **report-only** so they do not silently become a second Builder. This practice operationalizes [Context Gates](/patterns/context-gates) on the output of implementation.

## When to Use

**Use this practice when:**
- Implementation for a PBI claims done or ready for review
- The Spec has Contract scenarios (or equivalent binary acceptance criteria)
- You need a completeness pass that can extend the PBI with remaining work

**Skip this practice when:**
- There is no Contract / no scenarios—record Gap and either return to Spec work or proceed to Critic with that note
- The change is documentation-only with no behavioral Contract
- The operator documents an explicit skip on the PBI

## Process

### Step 1: Load Contract and Diff

Gather:

1. Spec Contract scenarios (and Definition of Done if present)
2. PBI Verification criteria
3. Diff or touched paths for this PBI

If [Pre-Implementation Analyze](/practices/pre-implementation-analyze) previously FAILed and was not waived, do not Converge—return to planning.

### Step 2: Build Coverage Matrix

For each Contract scenario:

| Scenario | Evidence | Status |
|----------|----------|--------|
| … | test id, command output, or precise behavior pointer | Covered \| Missing \| Partial |

Evidence must be re-runnable or precisely located. “Looks fine” is not evidence.

Prefer evidence the project toolchain already runs: a named test, a CLI invocation from the constitution Toolchain table, or a Contract scenario id that maps to an automated check. When only a manual observation exists, record the exact surface and expected signal so a later session can reproduce it.

### Step 3: Append Tasks or FAIL

When Status is Missing or Partial:

- Append a checkbox to PBI Verification (or Scope) naming the scenario and the missing evidence
- Do **not** edit product source in this practice
- Do **not** weaken Spec scenarios to green the matrix

If the matrix cannot be built (unreadable Spec, wrong PBI), **FAIL**.

### Step 4: Declare Converged or Not

- **Converged** — every required scenario has evidence
- **Gaps** — tasks appended; not ready to claim done
- **FAIL** — no trustworthy matrix

Never announce “all green” without publishing the matrix. Pair with [Evidence Before Claims](/practices/evidence-before-claims): each Covered cell needs a fresh proving command or precise pointer, not confidence.

### Step 5: Hand Off to Critic

Only after **Converged** (or a recorded skip) run [Adversarial Code Review](/practices/adversarial-code-review). Critic may still FAIL on constitutional or Spec-compliance grounds even when Converged.

## Related Patterns

This practice implements:

- **[Context Gates](/patterns/context-gates)** — Output Gate after build

Depends on:

- **[The Spec](/patterns/the-spec)** / **[The PBI](/patterns/the-pbi)**

Preceded by:

- **[Pre-Implementation Analyze](/practices/pre-implementation-analyze)**

Followed by:

- **[Adversarial Code Review](/practices/adversarial-code-review)** — quality, report-only
- **[Adversarial Code Review (pattern)](/patterns/adversarial-code-review)** — structural form of Critic separation
- **[Verify Against Spec](/recipes/verify-against-spec)** — end-to-end handoff sequencing this practice

## Templates & Examples

```markdown
# Implementation Converge — <PBI id>

| Scenario | Evidence | Status |
|----------|----------|--------|
| … | `tests/…::test_name` / command excerpt | Covered |

## Appended PBI tasks
- [ ] …

## Result: Converged | Gaps | FAIL
```

## Common Mistakes

### Merging Converge into Critic

**Problem:** The Critic starts appending tasks or “fixing” code, losing adversarial separation.

**Solution:** Critic reports only. Converge owns completeness appends.

### Claiming Converged Without Evidence

**Problem:** False completeness and Intent Debt.

**Solution:** Require a re-runnable test, command, or precise behavior pointer per scenario.

### Editing the Spec to Drop Scenarios

**Problem:** Hides unfinished work inside “cleanup.”

**Solution:** Change the Spec in a deliberate update; never during Converge.

### Converging Before Analyze

**Problem:** You verify coverage against inconsistent planning artifacts.

**Solution:** For non-trivial PBIs, require Analyze PASS (or waiver) first.
