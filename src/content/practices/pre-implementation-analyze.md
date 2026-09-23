---
title: "Pre-Implementation Analyze"
longTitle: "Pre-Implementation Analyze: Consistency Check Across Spec, PBI, and Paths Before Build"
description: "The process of running a read-only pre-build checkpoint for gaps, Contract quality, and Spec↔PBI↔path consistency."
tags:
  - Spec-Driven Development
  - Quality Gates
  - Practices
  - Verification
  - Context Engineering
status: "Proposed"
relatedIds:
  - "patterns/context-gates"
  - "patterns/the-spec"
  - "patterns/the-pbi"
  - "practices/living-specs"
  - "practices/pbi-authoring"
  - "practices/adversarial-requirement-review"
  - "practices/implementation-converge"
  - "concepts/spec-driven-development"
  - "recipes/verify-against-spec"
  - "practices/evidence-before-claims"
lastUpdated: 2026-09-23
steps:
  - name: "Resolve Spec and PBI"
    text: "Locate the living Spec for the domain and the active Product Backlog Item—by explicit path or from the project's task queue index."
  - name: "List Requirement Gaps"
    text: "Enumerate unanswered questions and unmarked assumptions that would force an implementer to invent product intent."
  - name: "Assess Contract Quality"
    text: "Confirm Contract scenarios, Definition of Done, and guardrails are specific enough to pass or fail without debate."
  - name: "Cross-Check Consistency"
    text: "Compare Spec Contract, PBI Scope and Verification, and cited paths or tests for conflicts, orphans, and missing pointers."
  - name: "Issue PASS or FAIL"
    text: "Publish a structured report. Do not edit Spec, PBI, or product code. Block implementation on FAIL unless the operator records an explicit waiver on the PBI."
references:
  - type: website
    title: "Understanding Spec-Driven Development: Kiro, spec-kit, and Tessl"
    author: "Birgitta Böckeler"
    url: "https://martinfowler.com/articles/exploring-gen-ai/sdd-3-tools.html"
    published: 2025-10-15
    accessed: 2026-09-22
    annotation: "Describes cross-artifact verification before build and warns that verbose markdown pipelines can create a false sense of control—keep this practice read-only and thin."
  - type: website
    title: "How to Write a Good Spec for AI Agents"
    author: "Addy Osmani"
    url: "https://addyosmani.com/blog/spec-for-ai-agents/"
    published: 2026-03-15
    accessed: 2026-09-22
    annotation: "Argues for structured, verifiable acceptance criteria—the standard this practice uses when judging Contract quality."
---

## Definition

**Pre-Implementation Analyze** is the process of running a **read-only** checkpoint after planning and before a Builder writes production code. You load the living [Spec](/patterns/the-spec) and the active [PBI](/patterns/the-pbi), then produce a PASS or FAIL report covering three areas: unanswered requirement gaps, Contract quality, and consistency among Spec, PBI, and cited paths or tests.

The outcome is a go/no-go decision for implementation—not a rewrite of the Spec, and not a code review. This practice operationalizes [Context Gates](/patterns/context-gates) on the boundary between planning output and build input.

## When to Use

**Use this practice when:**
- A non-trivial PBI is ready for Builder handoff
- Behavior is governed by a living Spec Contract
- Spec, PBI Scope/Verification, and test or file pointers must agree before coding starts
- You need a deterministic stop that prefers false FAIL over silent proceed

**Skip this practice when:**
- The change is a trivial chore with established why (typo, dependency pin, rename with no behavior change)
- There is no Spec domain yet and the work is pure exploration—run [Adversarial Requirement Review](/practices/adversarial-requirement-review) first
- The operator records an explicit waiver on the PBI

## Process

### Step 1: Resolve Spec and PBI

Collect:

1. Living Spec path (for example `specs/<domain>/spec.md`)
2. Active PBI path, or the head item from the tasks queue index (for example `tasks/README.md`)
3. Constitution file only if needed to judge Scope against NEVER/ASK rules—do not expand into a full constitutional review here

If either Spec or PBI is missing for a non-trivial change, **FAIL** with Gap: cannot analyze.

### Step 2: List Requirement Gaps

List holes that would force the Builder to invent intent:

- Who is the actor or operator of the behavior?
- What is success in observable terms?
- What is explicitly out of Scope?
- Are constitution ASK items relevant to this PBI left unanswered?

For each hole, write either one concrete question for the human or a proposed **Assumption** clearly labeled as non-fact.

### Step 3: Assess Contract Quality

Treat the Spec **Contract** as the sole quality bar for requirements. Do not invent a parallel Definition of Done outside the Spec.

Confirm:

- At least one scenario with expected I/O or an observable outcome
- Definition of Done items a stranger could mark pass or fail
- Guardrails that would bind implementation are visible
- Vague words (“fast”, “simple”, “robust”) are quantified or removed

**FAIL** if scenarios are absent or purely aspirational prose.

### Step 4: Cross-Check Consistency

| Source | Must align with |
|--------|-----------------|
| Spec Contract scenarios | PBI Verification criteria |
| PBI Scope | Spec boundaries; no silent Architecture rewrite |
| Cited paths or tests | Exist, or are explicitly marked “to create” |
| PBI Directive | Spec intent (no contradictory product goal) |

Label findings as **Conflict**, **Orphan**, or **Missing**.

### Step 5: Issue PASS or FAIL

Emit one report with three sections—Gaps, Contract quality, Consistency—and end with **PASS** or **FAIL**.

Hard rules:

- Read-only: do not edit Spec, PBI, or product code in this practice
- On FAIL, Builders must not implement until PASS or a recorded human waiver
- Prefer false FAIL when unsure

## Related Patterns

This practice implements:

- **[Context Gates](/patterns/context-gates)** — Output Gate after planning; Input Gate before build

Depends on:

- **[The Spec](/patterns/the-spec)** — Contract scenarios are the quality bar
- **[The PBI](/patterns/the-pbi)** — transient delta under analysis

See also:

- **[Living Specs](/practices/living-specs)** / **[PBI Authoring](/practices/pbi-authoring)** — how the inputs are written
- **[Adversarial Requirement Review](/practices/adversarial-requirement-review)** — challenges *why* before Spec exists
- **[Implementation Converge](/practices/implementation-converge)** — completeness after build; then Critic
- **[Verify Against Spec](/recipes/verify-against-spec)** — end-to-end handoff sequencing this practice

## Templates & Examples

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

## Common Mistakes

### Rewriting the Spec During Analyze

**Problem:** The gate becomes a planning session; drift is hidden inside “helpful” edits.

**Solution:** Keep the practice read-only. Open a separate Spec update if content must change.

### Treating Analyze as Critic

**Problem:** Pre-code consistency is confused with post-diff adversarial review.

**Solution:** Critic runs after [Implementation Converge](/practices/implementation-converge), against the diff and contracts.

### Duplicating DoD Outside the Contract

**Problem:** A second requirements document drifts from the Spec and doubles review load.

**Solution:** Judge quality against Contract scenarios only; report findings in the Analyze report.

### Running Analyze on Every Typo Fix

**Problem:** Process sledgehammer for chores with no behavior change.

**Solution:** Skip when the PBI marks trivial Scope and no Contract scenarios apply.
