---
title: "Evidence Before Claims"
longTitle: "Evidence Before Claims: Run Verification Before Declaring Done"
description: "The process of requiring fresh toolchain evidence before any success or completion claim against Spec or PBI criteria."
tags:
  - Quality Gates
  - Verification
  - Spec-Driven Development
  - Practices
status: "Proposed"
relatedIds:
  - "patterns/context-gates"
  - "patterns/the-pbi"
  - "patterns/the-spec"
  - "practices/implementation-converge"
  - "practices/adversarial-code-review"
  - "practices/pre-implementation-analyze"
  - "practices/pbi-authoring"
  - "practices/micro-commits"
  - "concepts/test-driven-development"
  - "recipes/verify-against-spec"
lastUpdated: 2026-09-23
steps:
  - name: "Identify the Proving Command"
    text: "Name the exact project Toolchain command or Contract scenario check that would falsify the claim you are about to make."
  - name: "Run It Fresh"
    text: "Execute that command in this session. Do not reuse remembered output from an earlier turn or another agent."
  - name: "Read Exit Code and Failures"
    text: "Inspect the full relevant output. Count failures. Partial green is not success."
  - name: "Claim Only With Evidence"
    text: "State the claim together with the command and outcome. If evidence is missing or red, state the actual status instead."
references:
  - type: website
    title: "My LLM Coding Workflow Going into 2026"
    author: "Addy Osmani"
    url: "https://addyo.substack.com/p/my-llm-coding-workflow-going-into"
    published: 2026-01-01
    accessed: 2026-09-23
    annotation: "Emphasizes verification loops and save-points for agent work—aligns with requiring fresh evidence before completion claims."
---

## Definition

**Evidence Before Claims** is the process of refusing success, completion, or “all green” language until a **fresh** project Toolchain run (or an equivalent Contract check) has been executed and read in the current session. The outcome is a claim tied to observable evidence—or an honest report that evidence is missing or red.

This practice operationalizes the **Quality** tier of [Context Gates](/patterns/context-gates). It complements [Implementation Converge](/practices/implementation-converge) (scenario coverage) and precedes [Adversarial Code Review](/practices/adversarial-code-review) (quality judgment).

## When to Use

**Use this practice when:**
- About to say a PBI, scenario, test suite, lint, or build is done or passing
- About to commit, open a merge request, or hand off to Critic
- An implementer or subagent reported success and you are about to trust that report

**Skip this practice when:**
- You are only drafting plans or Spec text with no completion claim
- The operator asked for a hypothesis or spike with no verification expectation

## Process

### Step 1: Identify the Proving Command

Ask: what single command from the project's constitution Toolchain table (or Spec Contract scenario) proves this claim?

Examples: `make check`, `pnpm test:run`, a named test node id. “Looks correct” is not a proving command.

### Step 2: Run It Fresh

Run that command now. Do not rely on:

- Output from a previous message
- Another agent's summary
- Partial runs or assumed caches

### Step 3: Read Exit Code and Failures

Confirm exit code and skim failure counts. If the proving surface is a Contract scenario, record the same evidence you would put in an [Implementation Converge](/practices/implementation-converge) matrix cell.

### Step 4: Claim Only With Evidence

Allowed shape:

> Ran `<command>` → exit 0 / N failures. Therefore `<claim>`.

Forbidden shape: “Should pass,” “Looks good,” “Done,” or satisfaction language before Step 2–3.

## Related Patterns

This practice implements:

- **[Context Gates](/patterns/context-gates)** — Quality Gate (deterministic toolchain)

Depends on:

- **[The Spec](/patterns/the-spec)** / **[The PBI](/patterns/the-pbi)** — what “done” means

See also:

- **[Implementation Converge](/practices/implementation-converge)** — coverage matrix before Critic
- **[Verify Against Spec](/recipes/verify-against-spec)** — end-to-end handoff
- **[Test-Driven Development](/concepts/test-driven-development)** — red/green as evidence discipline

## Templates & Examples

```markdown
## Evidence
- Command: `make check`
- Result: exit 0 (ruff, ty, pytest green)
- Claim: Quality Gate pass for PBI-…
```

## Common Mistakes

### Claiming From Confidence

**Problem:** “I’m sure it passes” replaces the run.

**Solution:** No claim without a fresh command in this session.

### Trusting Agent Success Reports

**Problem:** A Builder says green; you echo it.

**Solution:** Re-run the proving command yourself, or require Converge evidence paths.

### Substituting Lint for the Real Gate

**Problem:** Linter clean ≠ tests or build.

**Solution:** Match the claim to the command that actually proves it.
