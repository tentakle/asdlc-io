---
title: "MCP Evals — Deterministic Retrieval Quality Gate"
status: "approved"
owner: "Ville Takanen"
linear: "AL-78"
archetype: "feature"
created: "2026-05-22"
tags: []
---

# Feature: MCP Evals — Deterministic Retrieval Quality Gate

## Blueprint

### Context

Content edits can silently degrade the knowledge retrieved by agents. This suite
protects representative discovery and article retrieval intents against the
published corpus, independently of HTTP conformance and deployed client checks
owned by the [MCP transport contract](../mcp-transport/spec.md).

### Architecture

- `evals/mcp/retrieval.fixtures.json` owns the reviewed query expectations, listing
  checks, article retrieval checks, and their intent descriptions.
- `scripts/run-mcp-evals.mjs` exercises `src/mcp/tools.ts` and
  `src/mcp/content.ts` against `src/mcp/articles.json`. The content schema lives in
  `src/content/config.ts`; `scripts/generate-mcp-index.mjs` produces the index.
- [Fixture guidance and cadence](../../evals/mcp/README.md) describe authoring and
  failure triage. `lefthook.yml` runs the suite during pre-push, after the build;
  `package.json` exposes `pnpm evals:mcp` for explicit local runs.

### Constraints

The gate is deterministic and local: it uses the deployed retrieval logic without
HTTP, model calls, credentials, or added dependencies. It evaluates the generated
index, so callers rebuild that index after content changes. A normal run should
remain fast enough for every push (target: under one second of harness execution
on the current corpus, excluding package-manager startup and index generation).

Fixtures encode editorially justified expectations, not popularity claims. Until
agent telemetry is available, intent selection comes from the KB's core topics
and agent workflows. Search results are checked for required inclusion; stronger
rank bounds apply only where justified. This suite measures selected queries,
not general semantic recall. HTTP tests do not count as retrieval intents.

## Contract

### Definition of Done

- At least 20 positive search intents cover concepts, patterns by problem,
  practice guidance, and recipes, alongside empty-result, listing, and retrieval
  checks. Intent descriptions explain why each expected result is useful.
- Retrieved articles retain selected cross-reference links, and the linked
  targets can be retrieved successfully. Recipe retrieval retains usage guidance.
- Every expectation passes on a freshly generated published-content index.
- Failures identify the case and violated expectation and return a nonzero exit;
  success reports case totals and returns zero.
- The pre-push gate runs after the build; the README documents explicit runs
  after relevant changes and how to review fixture changes.

### Regression Guardrails

- Foundational lookup, natural-language context lookup, historical persona
  search, empty search, and missing-article expectations remain covered.
- A missing article is an expected domain error; successful retrieval cases
  explicitly require success and useful article content.
- Draft content remains unavailable; its negative fixture changes only when the
  article is intentionally published.
- Cross-reference assertions check returned Markdown, not only source metadata.
- Changed expectations require an intentional editorial rationale. Search
  limitations are recorded rather than represented as successful semantic recall.

### Scenarios

```gherkin
Scenario: Discover guidance by a problem description
  Given a freshly generated published-content index
  When an agent searches for "validate output artifacts"
  Then the results include the Context Gates pattern

Scenario: Retrieve a related concept
  Given an agent retrieves the Agent Skills article
  Then its Markdown retains the link to the MCP concept
  When the agent retrieves the linked MCP slug
  Then it receives the MCP article successfully

Scenario: Retrieve a usable recipe
  When an agent retrieves the Critic recipe
  Then the response includes its usage hint and recipe metadata

Scenario: Queries have no applicable content
  When an agent searches for the fixture's unrelated noise query
  Then the result set is empty
  When an agent retrieves the fixture's nonexistent slug
  Then the result is a domain error

Scenario: A content edit regresses an expected result
  Given an expected article is absent from a query's results
  When the retrieval suite runs
  Then the failing case names the missing expectation
  And the process exits nonzero
```

### Superseded draft assumptions

[DEPRECATED 2026-09-21] The initial Architecture, fixture table, Wiring, and
Definition of Done described separate listing files, derived get cases, obsolete
slugs, and a 13-case floor. The single fixture file and the contract above replace
those assumptions. Exact execution logic belongs in the harness, not this spec.

[DEPRECATED 2026-09-21] The draft's CI/open-question and future-work sections were
aspirational. The binding cadence is local pre-push plus explicit runs, documented
in the README. Hosted CI, LLM judging, historical dashboards, and telemetry-seeded
cases remain potential later work, not guarantees of this gate.
