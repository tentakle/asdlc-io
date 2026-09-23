# AL-77 capture verification

Contract: [Agent usage telemetry](spec.md).

## Implementation status

Capture is implemented for MCP operations, negotiated Markdown and direct
Markdown requests. Collection defaults to off. No new dependencies are needed.
Reporting and verification use the private PostHog UI. Local snapshot, report
and cleanup commands are outside scope; no query API key is required. Production
capture remains gated on deployed evidence.

Local verification on 2026-09-23: 237 unit tests (including 45 telemetry tests),
30 retrieval evals, lint, type/spec checks and the Astro build pass. These tests
verify payload allowlisting, redaction, structured outcomes, unchanged MCP wire
responses, Markdown exclusions, disabled modes, one-attempt capture and timeout
isolation. They do not establish PostHog ingestion, field expiry or deployed
Netlify cache behavior.

## Preview gate

### Active deployment (2026-09-23)

- Draft PR: https://github.com/villetakanen/asdlc-io/pull/83
- Preview: https://deploy-preview-83--asdlc-io.netlify.app
- Capture implementation: `5a6da94`; production remains unchanged.
- Preview capture variables are configured in Netlify's Functions scope. The
  first deploy used the preceding PR's MCP browser origin; it correctly rejected
  the new preview origin. `MCP_PREVIEW_ORIGIN` now names PR 83 and requires a new
  deploy before the complete wire smoke test can pass.
- A conditional direct Markdown request returned HTTP 200 despite a matching
  ETag. Record the actual status: a 200 delivery is eligible for capture, whereas
  a 304 is excluded. Do not assume every conditional request returns 304.
- Provider ingestion and field placement are still being verified; neither
  initial deployment success nor HTTP response parity proves capture delivery.

1. Select a private PostHog Cloud EU project. Record its region, access controls,
   retention settings and billing limits. Keep production capture off.
2. Configure `TELEMETRY_MODE=preview`,
   `POSTHOG_CAPTURE_HOST=https://eu.i.posthog.com` and the project's
   `POSTHOG_PROJECT_TOKEN` for a Netlify deploy-preview or branch-deploy in the
   Functions scope. A CLI draft deploy with a different context remains off.
   UI verification uses your PostHog account; no personal API key is needed.
3. Deploy this changeset to that preview. Record the commit and deployment URL.
   Run `pnpm test:mcp-preview <preview-url>` to check the existing wire contract.
4. Within a recorded UTC interval, perform one synthetic search with a unique,
   non-personal phrase (for example `al77-smoke-<random UUID>`). Then request
   `/concepts/agentic-sdlc.md` twice and `/concepts/agentic-sdlc/` twice with
   `Accept: text/markdown`. Record HTTP status, content type, cache headers and
   body hashes. Both forms must preserve their existing delivery behavior.
5. Inspect the narrow interval in the PostHog UI (using SQL insights when table
   inspection is needed), filtering `asdlc_environment` to the
   preview's actual context. In ordinary `events`, expect one search span for
   that phrase's operation and four `article_retrieved` events, split two direct
   and two negotiated. Do not count the span's second copy in
   `posthog.ai_events` again. Allow for ingestion delay. Isolate other smoke
   requests by time, surface and operation; a shared busy preview cannot prove
   exact counts from a broad time window.
6. Inspect the matching span by `asdlc_event_id` in `posthog.ai_events`. Its
   `$ai_input_state` must contain only the bounded synthetic query, and its
   `$ai_output_state` must match durable count/outcome/article-ID properties.
   Inspect the complete ordinary `events` properties: the query and both large
   state fields must be absent. Verify no person profile was created. Save only
   sanitized evidence, never credentials or unrelated query data.
7. Verify HEAD, 304, missing articles and HTML fallbacks create no Markdown
   events. Repeat retrievals that are demonstrably CDN cache hits and confirm
   each eligible delivery is still counted once. Test production/off context
   gating. A forged request header must not suppress an eligible event.
8. Exercise rejected and stalled capture on an isolated preview using temporary
   test instrumentation; verify unchanged response bodies/status and prompt
   delivery, with at most one outgoing capture attempt and a five-second abort.
   Remove that instrumentation before merging. Local tests already simulate
   these failures, but deployed behavior is a separate acceptance check.
9. Record sanitized evidence and provider documentation here, then schedule a
   check after the synthetic span's 30-day retention window: its state fields
   must be gone while the ordinary custom-property counts remain available.
   Initial ingestion alone does not prove expiry.

## Dashboard setup and first review

Create a private dashboard named `ASDLC agent usage`. Set an explicit production
filter and schema version 1 on every saved insight; preview checks use a separate
filtered view. Default to the last seven completed UTC days.

| Insight | Counting rule |
| --- | --- |
| Delivered articles | Ordinary events; operation `retrieve`, outcome `success`; count by canonical article ID and surface; top ten |
| Completed searches | Ordinary `$ai_span` events; operation `search`, outcome `success` or `zero_results` |
| Zero-result rate | Zero-result searches / completed searches; show no data for a zero denominator |
| Tool failures | Ordinary `$ai_span` events; outcome `failure`; break down by failure category and operation |

Use private AI Observability inspection for recent zero-result spans, filtered
by environment, operation and outcome. Counts always come from the ordinary
events table; never sum the AI table's duplicate spans into the dashboard.
Inspect query text in input state without copying it into saved insight titles,
descriptions, SQL literals or review evidence.

After real traffic arrives, record the dashboard link, reviewed UTC interval,
environment, query-free findings, known coverage gaps and billing/usage review.
Dashboard creation and first real usage review remain pending; local tests do
not satisfy them. No local export or retention-cleanup workflow is required.
