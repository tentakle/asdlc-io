---
title: "Agent Usage Telemetry"
status: "draft"
owner: "Ville Takanen"
linear: "AL-77"
archetype: "feature"
created: "2026-09-22"
updated: "2026-09-23"
tags: ["telemetry", "mcp", "posthog"]
---

# Feature: Agent Usage Telemetry

## Blueprint

### Context and decisions

ASDLC needs evidence of which articles its machine-facing surfaces deliver and
which searches return no results. These events measure deliveries and searches,
not unique agents, readership or successful task completion.

**Accepted direction (Ville, 2026-09-22):** use PostHog Cloud for collection and
aggregation. Capture MCP operations as AI Observability spans, with bounded,
best-effort redacted query text only in the 30-day input-state field. Markdown
deliveries use ordinary analytics events.

**Simplification (Ville, 2026-09-23):** use the private PostHog UI for dashboards,
recent failed-search inspection and verification. Capture needs only the project
token; no local reporting pipeline or read API credential is required. Collection
has not begun; deployed verification remains pending.

[DEPRECATED 2026-09-22] The earlier Netlify Blobs design required per-event
objects, listing and aggregation logic, and scheduled remote deletion. PostHog
replaces that storage design, including its Netlify cleanup function. The prior
Blobs decision is superseded by the user's selection of PostHog.

### Architecture

| Concern | Boundary |
| --- | --- |
| MCP operation and outcome | `src/mcp/tools.ts`, `src/mcp/content.ts`, `src/mcp/server.ts` |
| Deployed MCP observation | `netlify/edge-functions/mcp.ts` |
| Negotiated Markdown observation | `netlify/edge-functions/markdown-negotiation.ts` |
| Direct Markdown observation | `netlify/edge-functions/markdown-telemetry.ts` for static Markdown endpoints under `src/pages/` |
| Validation, redaction and capture | `src/lib/telemetry/` with a Zod event schema and native capture adapter |
| Dashboards and recent query inspection | Private PostHog UI |
| Remote ingestion and expiry | PostHog Cloud capture API and AI event retention |

Tool execution returns rendered MCP content and internal structured outcome
metadata: resolved
collection/slug identifiers, result count and outcome category. The transport
returns only the existing MCP response and hands the metadata to an optional
observer. Retrieve/search once; neither parse rendered text nor execute a second
lookup for telemetry. Local tests and retrieval evals use an inert observer.

Observation wraps the recognized `tools/call` handler in `src/mcp/server.ts`,
including its argument validation and execution-error catch. Each recognized
tool invocation produces one terminal observation. A thrown execution error
converted to `-32603` is an `execution_error`, not a pre-dispatch rejection.
Unknown tools and requests rejected before recognized tool handling produce no
event. Observer failures never enter the tool-error catch or change its response.

Use native HTTP capture from the edge, registered with the runtime's background
work lifetime. One capture POST per eligible operation, with a five-second abort
deadline, redirects rejected and no application retry. Completion of telemetry
is independent of the response. Errors produce a sanitized diagnostic category,
without query text, payloads or credentials. Loss is acceptable; response failure
or latency caused by awaiting the capture request is not. No browser SDK, Blobs
SDK, scheduled Functions runtime or new dependency is required by this design.

### Event and counting contract

All events have a schema version, server-generated event ID and timestamp,
environment, surface, operation and outcome. IDs never encode query text or
client identity. Disable person-profile processing and use request-scoped random
identity for capture; all reporting uses event counts, not unique-user metrics.
Article identifiers are resolved published collection/slug pairs. MCP includes
recipes; Markdown coverage remains concepts, patterns and practices.

| Action | Capture and reporting meaning |
| --- | --- |
| MCP search | One `$ai_span`; result count and returned article IDs are exposure, not retrieval |
| MCP article retrieval | One `$ai_span`; success counts as one delivered article |
| MCP listing | One `$ai_span` with count, excluded from retrieval totals |
| Known tool with invalid arguments, unavailable article or execution error | One `$ai_span` with bounded failure category, excluded from successful retrievals |
| Successful Markdown GET | One `article_retrieved` analytics event, marked direct or negotiated |

Each MCP operation is a self-contained span with server-generated trace/span
identifiers; it does not claim knowledge of an upstream agent's full trace.
The following durable custom properties are the versioned producer/query
contract; the Zod schema enforces their types and allowed combinations.

| Property | Values / meaning |
| --- | --- |
| `asdlc_schema_version` | Integer `1` for this contract |
| `asdlc_event_id` | Server-generated UUID; joins the two PostHog copies |
| `asdlc_environment` | `production`, `deploy-preview`, `branch-deploy` |
| `asdlc_surface` | `mcp`, `markdown_direct`, `markdown_negotiated` |
| `asdlc_operation` | `search`, `retrieve`, `list` |
| `asdlc_outcome` | `success`, `zero_results`, `failure` |
| `asdlc_failure_category` | `null`, `invalid_arguments`, `article_unavailable`, `execution_error` |
| `asdlc_result_count` | Nonnegative integer for completed operations; `null` for failures |
| `asdlc_article_ids` | Canonical collection/slug array for successful search/retrieval; empty for listing and failures |
| `asdlc_query_state` | `captured`, `not_applicable`, `invalid_arguments`, `redaction_failed` |
| `asdlc_query_redacted`, `asdlc_query_truncated` | Booleans when query state is `captured`; otherwise `null` |

Zero-result searches have outcome `zero_results`, count `0`, and no failure
category. Successful retrievals have count `1`; listings report the article
count with outcome `success`, even when empty. Failures have outcome `failure`
and a non-null failure category. Markdown events are successful retrievals only.
Dashboards calculate zero-result rate over completed searches, excluding failures.
Capture failures belong to operational diagnostics, not tool failure categories.

Each span supplies `$ai_input_state`: an object with `query` containing the
sanitized text for a valid search, or an empty object for non-search operations,
invalid search arguments or sanitizer failure. Query-state metadata distinguishes
these cases. `$ai_output_state` contains `result_count`, `article_ids`, `outcome`
and `failure_category`, with the same meanings as their durable counterparts.
Listing output carries its count and an empty ID array. Neither state contains
article bodies or free-form errors. Both state fields expire after 30 days;
historical queries use the durable custom properties, never the output state.
The provider timestamp is the server-observed operation completion time.

Protocol rejections, discovery, catalogs, preflights and discarded notifications
produce no usage event. Markdown HEAD, redirects, errors and HTML fallback
produce no retrieval event. Repeat external requests count separately; an
internal rewrite counts once. The negotiation handler owns negotiated events;
the direct observer owns external `.md` requests. Keep the internal rewrite on
`context.next(new Request(...))`, which continues the existing chain rather than
starting a new target-path edge chain. Switching to same-site `fetch()` or a
returned URL would require redesigning and re-verifying event ownership.
Client-supplied marker headers never suppress collection.
Observers use default uncached edge execution
(no manual edge-response caching), preserving downstream static caching. Verify
both cache-hit coverage and rewrite behavior on a deployed preview. Delivery
means a successful server response, not proof that the client consumed it.

### Query privacy and retention

Redact recognizable email addresses, IP addresses, phone numbers, URLs and
credential-shaped values before retaining at most 256 Unicode code points.
Normalize whitespace and mark redaction/truncation. The original query reaches
retrieval unchanged. Sanitizer failure omits input text, preserving counts and
outcome. This is best-effort redaction, not a guarantee of anonymity; all
query-bearing artifacts remain private. Test technical strings including
`ADR 0002`, `ISO 27001` and version numbers against accidental phone redaction.

Only sanitized search text may enter `$ai_input_state`. Query text is excluded
from event names, IDs, custom properties, error messages, diagnostics and saved
query literals. IPs, cookies, full URLs, authorization headers, user agents,
client-supplied IDs, arbitrary tool arguments and article bodies are excluded.
Use PostHog's IP-discard setting and disable unwanted enrichment; never forward
request headers as event properties.

PostHog's documented AI retention stores full `$ai_` events in `posthog.ai_events`
for 30 days and a trimmed copy in `events` without the expiring input/output
fields. Retain counts and article metadata in that trimmed copy. Ordinary custom
properties do not inherit 30-day expiry. General event retention follows the
project's plan and enforcement state, not a configurable short TTL. Record that
state during setup. The feature relies on the provider's documented lifecycle,
not an exact deletion-time guarantee measured by our collector.

Query text is read only from recent AI events. Query-free historical reporting
uses the ordinary events table. Never add these tables' counts together: they
contain copies of the same MCP events. Inspect optional input text by event ID
in the private UI. Keep query text out of saved dashboard definitions, copied
reports and verification evidence; the feature creates no local query artifacts.

### Environments and cost

Select PostHog Cloud EU for the initial project. Runtime configuration owns the
capture host, project token and collection mode: `off`, `production`, or
`preview`. Default is `off`; production mode accepts only production deployment
context. Preview mode accepts `deploy-preview` and `branch-deploy`, records the
actual deployment context in `asdlc_environment`, and uses
a separate project token when available. In a shared project, all production
queries must explicitly filter environment. Local runs use an in-memory sink.
Missing or inconsistent configuration disables collection without failing HTTP.

[DEPRECATED 2026-09-23] The initial preview-only wording left branch deploys
implicitly disabled. Explicit preview mode now includes branch deploys; other
deployment contexts remain disabled.

| Configuration | Scope and purpose |
| --- | --- |
| `TELEMETRY_MODE` | Edge: `off` (default), `production`, `preview` |
| `POSTHOG_CAPTURE_HOST` | Edge: EU ingestion origin, `https://eu.i.posthog.com` |
| `POSTHOG_PROJECT_TOKEN` | Edge: capture-only project token, selected by deployment configuration |

Implementation adds placeholders and scope notes for these entries to
`.env.example`. Actual credentials stay out of version control. UI access uses
the operator's PostHog account; no read/admin API key is required. Configure and record
billing limits before enabling production capture. AI spans consume AI
Observability usage; Markdown events consume analytics usage. One capture call
is not a second MCP invocation, and event allowances are not a claim that total
Netlify or PostHog costs double or remain free. Record actual usage at the first
production review. Quota drops and capture failures limit report coverage.

### PostHog dashboards and review

Create a private agent-usage dashboard in PostHog, defaulting to production and
last seven completed UTC days. Use ordinary `events` for counts and historical
comparisons; filter schema version and environment explicitly. Count events,
not distinct users. Saved insights cover:

- Top ten delivered articles, broken down by surface: successful retrievals
  only, using the canonical article ID in the singleton article-ID array.
- Completed search count and zero-result rate (zero results divided by completed
  searches); exclude execution and argument failures from that denominator.
- Tool failures broken down by bounded failure category and operation.

Inspect recent zero-result spans in AI Observability, using environment,
operation and outcome filters. Read redacted query text only from the expiring
input state. Durable custom properties support historical metrics after state
expiry. Query text stays in the private UI and is never copied into saved insight
names, descriptions, query literals or public evidence. Redaction can collapse
different originals; nonempty results are not proof of a useful match.

Review the first real usage window and PostHog billing/usage in the UI. Record
its interval, environment, dashboard link and query-free findings, including
known collection gaps. Ingestion delay makes recent windows provisional; unknown
event loss remains unknown. An empty window or zero completed-search denominator
means insufficient data, not a zero-percent failure rate.

### Superseded local reporting design

[DEPRECATED 2026-09-23] Local snapshot, report and cleanup commands, paginated
Query API export, private artifact directories and local query credentials are
superseded by PostHog UI reporting. They are outside AL-77's implementation scope.
Provider-managed retention still applies to captured query text.

## Contract

### First implementation gate

Capture implementation status, UI dashboard setup and the deployed test
procedure are tracked in [verification notes](verification.md).

Before production capture, run a synthetic
preview smoke test through the deployed edge and the actual PostHog project.
Use the PostHog UI to prove a search span and Markdown event arrive, the span input is readable from
`posthog.ai_events`, and its ordinary `events` copy contains no query text.
Verify one-event counting, environment filtering, cache hits and unchanged
responses when capture fails or stalls. Record project region, configuration,
provider retention documentation and dated sanitized evidence. A smoke test
proves field placement and delivery, not that 30 days have elapsed; schedule a
later check of the synthetic span after its retention window.

### Definition of Done

- [ ] First implementation gate passes, with provider retention assumptions and
      the subsequent expiry check explicitly distinguished from observed evidence.
- [ ] Structured execution metadata preserves MCP response parity and retrieval
      evals, including recipe IDs and zero-result searches.
- [ ] Redaction, Unicode bounds and field allowlisting cover success and failure
      paths; ordinary events contain no query text.
- [ ] Both Markdown paths count once, including deployed cache-hit checks.
- [ ] Capture aborts, errors and disabled configuration leave responses unchanged;
      the observer never awaits remote telemetry before returning the response.
- [ ] Environment isolation and production billing limits are verified.
- [ ] `.env.example` documents capture configuration; no query API credential
      or local reporting command is required.
- [ ] A private PostHog dashboard shows delivered articles, completed searches,
      zero-result rate and tool failures with correct environment/counting filters.
- [ ] Recent failed-search text is inspectable in the private AI Observability UI
      without copying it into durable dashboard definitions or evidence.
- [ ] A first real usage and cost review is recorded with a dashboard link and
      query-free findings. Synthetic data alone does not complete AL-77.
- [ ] Implementation passes `pnpm check`, relevant tests, retrieval evals, build
      and deployed MCP/Markdown smoke checks.

### Regression Guardrails

The [MCP transport contract](../mcp-transport/spec.md) retains its protocol,
anonymous read-only client surface and response semantics. Telemetry introduces
no client-visible mutation tool. The
[Markdown variants contract](../markdown-variants/spec.md) retains publication
filtering, static payload parity, negotiation and fallback behavior.

The [MCP evals contract](../mcp-evals/spec.md) remains deterministic and
network-free. Its direct tool-execution consumer in `scripts/run-mcp-evals.mjs`
must continue asserting rendered response content and error behavior when the
internal result gains metadata; telemetry is inert during eval execution.

### Scenarios

```gherkin
Scenario: Known tool errors differ from pre-dispatch rejection
  When a known tool receives invalid arguments or throws during execution
  Then exactly one span records invalid_arguments or execution_error respectively
  And execution failure retains the existing -32603 response
  When an unknown tool or invalid protocol envelope is rejected
  Then no usage span is recorded

Scenario: No results are not an execution failure
  When a search completes with no results
  Then its outcome is zero_results and its result count is zero
  When search execution fails
  Then its outcome is failure and its result count is null
  And it is excluded from the completed-search zero-result rate

Scenario: Branch collection requires preview mode
  Given the deployment context is branch-deploy
  When collection mode is preview
  Then captured events retain environment branch-deploy
  And production reports exclude them
  When collection mode is production or off
  Then no events are captured

Scenario: Query text has a shorter lifetime than metrics
  When a search is recorded as an AI span
  Then only its input-state field contains the redacted query
  And the ordinary events copy contains counts and article IDs without query text
  And both input and output state are absent from the ordinary events copy
  And historical reporting uses durable custom properties after both states expire

Scenario: Redaction fails without breaking a search
  When sanitizing a completed search raises an error
  Then the span omits input text and retains the outcome and counts
  And retrieval and the client response remain unchanged

Scenario: Two provider tables do not double the counts
  Given a search span exists in both events and ai_events
  When viewing the dashboard interval
  Then the dashboard counts one search from the ordinary events table
  And recent input text is inspected separately in AI Observability

Scenario: Storage is slow or unavailable
  Given capture stalls or returns an error
  When an eligible request completes
  Then its response is delivered independently
  And capture is aborted after its deadline without an application retry

Scenario: A dashboard window has no completed searches
  Given the selected environment and interval contain no completed searches
  When viewing the zero-result rate
  Then the dashboard shows no data rather than a zero-percent rate

Scenario: Preview verifies both Markdown paths
  Given explicit preview collection configuration
  When direct and negotiated GETs each deliver the same published article
  Then two preview retrieval events are captured in total
  And production reports exclude both events
```

## References

- [AL-77](https://linear.app/asdlc/issue/AL-77) — capture, dashboard setup and first usage review.
- [PostHog spans](https://posthog.com/docs/ai-observability/spans) — tool/retrieval operations and input state.
- [AI event retention](https://posthog.com/docs/ai-observability/data-retention) — 30-day input expiry and trimmed event copy.
- [General event retention](https://posthog.com/docs/data/events-retention) — plan-based window and enforcement state.
- [Capture API](https://posthog.com/docs/api/capture) — event ingestion.
- [Data storage controls](https://posthog.com/docs/privacy/data-storage) — region and IP discard.
- [Edge background work](https://docs.netlify.com/build/edge-functions/api/#waituntil) and [edge caching](https://docs.netlify.com/build/edge-functions/optional-configuration/) — response independence and per-request execution.
- [Edge processing order](https://docs.netlify.com/build/edge-functions/declarations/#processing-order-caveats) — existing-chain continuation versus a new internal request chain.

Provider documentation checked 2026-09-22, with span fields and rewrite behavior
rechecked 2026-09-23; deployment evidence is still pending.
