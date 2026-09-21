# 4. Modern-only stateless MCP over HTTP

Date: 2026-09-21

## Status

Accepted — 2026-09-21 (HITL: Ville Takanen). This decision does not approve a
dependency installation or a production cutover.

Tracked by [AL-100](https://linear.app/asdlc/issue/AL-100), under
[AL-99](https://linear.app/asdlc/issue/AL-99). Acceptance unblocks the transport
contract in [AL-101](https://linear.app/asdlc/issue/AL-101).

## Context

ASDLC exposes three read-only tools over `/mcp`: `list_articles`,
`search_knowledge_base`, and `get_article`. A build-time content manifest and Fuse
index feed request-time retrieval. Neither the content service nor protocol
handler holds per-client sessions. Shared, immutable content caches do not make
the protocol stateful.

The access layer is outdated:

- `src/mcp/server.ts` advertises `2024-11-05` through `initialize` and has no
  `server/discover` or per-request version validation.
- `netlify/edge-functions/mcp.ts` opens a GET/SSE stream with an endpoint event
  and heartbeat, while POST independently returns JSON. It does not implement
  modern metadata/header validation, and its CORS allow-header list contains
  only `Content-Type`.
- `tests/mcp/mcp.edge.test.ts` and `scripts/test-deploy-preview.mjs` preserve
  those expectations. They do not establish interoperability with real clients.
- `scripts/run-mcp-evals.mjs` calls the content/tool layer directly. Its 18
  passing cases are a retrieval baseline, not a transport-conformance result.

MCP's released `2026-07-28` revision makes requests self-contained and removes
the initialization handshake from the modern protocol. Servers must implement
discovery, although clients can call tools directly. Modern and legacy behavior
may coexist. [Versioning and compatibility][versioning]

Our goal is reliable access to the existing knowledge base. Stateless execution
does not imply static hosting: searching still executes code. It also says
nothing about content freshness, which remains tied to the deployed build.

## Decision

### 1. Preserve the endpoint and use stateless POST/JSON

Keep `https://asdlc.io/mcp` on Netlify Edge Functions. Use Streamable HTTP with
single JSON responses for the existing tools. Do not create protocol sessions,
require connection affinity, or infer client context from earlier requests.
Keep the existing tool names, input meaning, text content, publication filters,
and retrieval algorithm.

Remove the standalone GET/SSE heartbeat service at cutover. GET and DELETE return
405; OPTIONS remains available for browser preflight. This matches our lack of
subscriptions and long-running interactions. Modern requests carry their own
metadata and mirrored HTTP headers; the contract must cover validation and
protocol-specific failures. [Streamable HTTP][http]

### 2. Support only the modern revision after cutover

After cutover, the only supported revision is `2026-07-28`. Ville Takanen
explicitly rejected post-cutover legacy support on 2026-09-21. There is no
compatibility bridge, grace period, parallel legacy endpoint, or retirement
window. Clients using any 2024 or 2025 revision must upgrade before connecting.

Reject legacy initialization and unsupported revisions with the protocol's
applicable diagnostics. Missing modern metadata must not trigger legacy
fallback. Do not retain the 2024 GET/SSE transport. Keep the URL, but clearly
state the new protocol requirement in setup/release guidance before cutover.
Changing an SSE configuration to HTTP is insufficient if the client still
speaks a legacy revision.

Configure the SDK for modern-only operation (`legacy: 'reject'`) and verify
that it does not execute legacy tool requests. Its default compatibility
behavior must not expand the supported surface. Exact request, notification,
and error handling belongs in the feature spec. [SDK legacy policy][sdk-legacy]

### 3. Prefer the official TypeScript SDK v2 at the protocol boundary

Use the official `@modelcontextprotocol/server` v2 web-standard HTTP entry point
instead of extending our hand-written protocol dispatcher. Its documented
`createMcpHandler` supplies the modern request machinery; configure it to reject
legacy requests. This delegates wire envelopes and protocol maintenance to the
SDK while our code owns tool behavior. [SDK migration guide][sdk-migration]

Keep `ContentService` and tool behavior independent of that adapter. Share only
immutable manifest/search data between requests. The SDK's stable v2 line and
Deno support make it a plausible fit for Netlify's Deno-based edge runtime;
they do **not** prove our bundle works there. [SDK documentation][sdk-home],
[Netlify runtime documentation][netlify]

Before adding dependencies, present the exact direct packages/versions and
transitive impact for approval under AGENTS.md. The current upstream server
manifest identifies `2.0.0`; resolve and pin an available stable version during
implementation. Check Node tooling requirements, schema-library compatibility,
and edge bundling without upgrading Astro's content schema as collateral work.
[Server package manifest][server-package]

AL-50 must prove edge suitability early. If it fails, return to this decision
with evidence; do not silently substitute a Node Function, add broad polyfills,
or introduce legacy compatibility.

### 4. Keep public access, with explicit browser boundaries

The endpoint remains anonymous and read-only. Do not add OAuth or cookies merely
to retrieve already-public articles. Authentication would add no content access
boundary here. Introducing private data or write tools requires a new decision.

Accept requests without an Origin header from native/server clients. For browser
requests, validate Origin against an exact configured allowlist: initially
`https://asdlc.io`, plus the specific preview origin in that preview deployment.
Additional browser-host origins require an explicit allowlist entry and test;
do not wildcard all Netlify previews. Reject malformed, null, and unlisted
origins with 403. Local development origins must be explicitly configured and
must not reach the production allowlist.

CORS grants only approved origins and the methods/headers needed by the selected
protocol revision; do not enable credentialed browser access. This is a browser
policy, not authentication of public native clients. Host routing must remain
limited to the intended deployment, with local development bound to loopback.
The protocol requires Origin validation; allowing CORS is not a substitute.
[Streamable HTTP security requirements][http]

## Client evidence and release targets

Evidence checked on 2026-09-21. **No client has yet been verified against the
upgraded endpoint, which does not exist.** “Observed” below means only a local
version check; “documented” means vendor-described behavior. Neither means a
passing deployment test.

| Client/version | Evidence | Intended verification |
| --- | --- | --- |
| Claude Code **2.1.278**, HTTP | Observed locally with `claude --version`. Vendor docs describe v2 runtime availability from 2.1.232 in feature-flag sessions and a default from 2.1.274 in sessions without feature flags; v2 probes HTTP servers for the new revision. | Required real-host target for AL-102. Record runtime mode and negotiated revision, then list/search/get. Documentation supports selection, not a claim that this installation has connected. |
| Official TypeScript client **2.0.0** | Upstream client manifest names this version; v2 documents the new protocol. Not installed or exercised here. | Reference client target, with an exact installed version recorded. Test modern direct requests and discovery on preview. |
| Clients requesting **2024 or 2025 revisions** | Explicitly outside the post-cutover support policy. | Negative contract and preview tests verify rejection and no legacy tool execution. |
| Other host applications/versions and 2024 SSE clients | No version-specific evidence collected. | No named-host guarantee. Clients must support the modern revision; add other hosts only with exact-version evidence. |

Sources: [Claude Code MCP runtimes][claude], [client package manifest][client-package].
The Claude Code documentation is a moving page; record an exact runtime/version
again when AL-102 runs. Do not infer protocol support from a product name or a
generic statement that it supports HTTP.

## Alternatives considered

| Alternative | Benefit | Reason not selected |
| --- | --- | --- |
| Temporary 2025 HTTP compatibility bridge | Could ease migration for handshake-based clients | Rejected by Ville: no legacy support after cutover. Keeping a second protocol era is outside the chosen scope. |
| Keep 2024 GET/SSE as well | Could preserve old configurations | Adds a separate streaming mechanism and compatibility burden without verified client demand. |
| Extend the current hand-written adapter | No new runtime dependency; direct control | Makes us responsible for protocol conformance and ongoing drift. The current gaps show the cost of that ownership. |
| Serve only static markdown/skill files | Minimal runtime | Removes tool-based search and breaks the existing MCP interface. Those distribution channels remain complements. |

## Rollout and rollback

1. Accept this ADR, then author the observable contract in AL-101. Dependency
   approval is separate; nothing is installed by accepting a document alone.
2. AL-50 implements the adapter, modern conformance tests, and legacy-rejection tests. Preserve retrieval evals.
   AL-102 verifies a deployed preview, the reference client, and Claude Code
   2.1.278 (or records and justifies its replacement version).
3. Cut over only after those checks pass and HTTP migration instructions exist.
   Do not describe the production endpoint as upgraded before deployment proof.
4. At cutover, remove all legacy serving paths. A client unable to use the
   modern revision is unsupported; do not extend a grace period or silently
   negotiate an older revision.
5. On a release-blocking discovery/tool regression, roll back to a known-good
   **modern-only** deployment and matching manifest if one exists. The initial
   migration has no such baseline: withdraw the faulty endpoint with a clear
   service-unavailable response while fixing forward, rather than restoring
   legacy MCP support. A site/content rollback must preserve this protocol
   boundary. Re-run preview checks before restoring service.

## Consequences and follow-up boundaries

We keep the public URL and retrieval behavior while replacing protocol plumbing.
The tradeoff is SDK/dependency ownership and an intentional break for all legacy
clients. They must upgrade; clients pinned to old revisions lose access.
The edge deployment and client matrix remain release gates, not assumed facts.

The [MCP transport contract](../../specs/mcp-transport/spec.md), authored in
AL-101, owns exact request/response schemas, required versus optional metadata,
status/error mappings, legacy rejection, tool-list cache policy, and
negative test scenarios. In particular, the final specification makes client
identity optional and advises server identity in result metadata; examples in
older material must not become stricter invented requirements. [Base protocol][basic]

AL-103 polishes the existing MCP concept article, preserving its URL and Live
status, and distinguishes statelessness from freshness. AL-78 expands retrieval
intents after transport verification as a priority choice, not a technical
dependency. OAuth, subscriptions, MRTR workflows, telemetry infrastructure, and
new tool capabilities remain outside this decision.

## Review record

- Authoring profile: one Codex author; local source inspection plus official
  protocol, SDK, client, and hosting documentation. No new independent review
  or live interoperability test is claimed for this ADR.
- Confidence: high in the current implementation gap and protocol direction;
  moderate in SDK edge suitability and compatibility scope until preview proof.
- Human decision, 2026-09-21 (Ville Takanen): no legacy support after cutover.
  This supersedes the initial bridge proposal and its retirement window.
- ADR accepted, 2026-09-21 (Ville Takanen), after the modern-only correction.
  Acceptance includes the SDK preference, origin policy, and rollout/rollback
  boundary. Exact dependency additions and production cutover remain separate.

[versioning]: https://modelcontextprotocol.io/specification/2026-07-28/basic/versioning
[http]: https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http
[basic]: https://modelcontextprotocol.io/specification/2026-07-28/basic
[sdk-migration]: https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/migration/support-2026-07-28.md
[sdk-home]: https://ts.sdk.modelcontextprotocol.io/v2/
[server-package]: https://github.com/modelcontextprotocol/typescript-sdk/blob/main/packages/server/package.json
[client-package]: https://github.com/modelcontextprotocol/typescript-sdk/blob/main/packages/client/package.json
[netlify]: https://docs.netlify.com/build/edge-functions/overview/
[claude]: https://code.claude.com/docs/en/mcp#mcp-client-runtimes

[sdk-legacy]: https://ts.sdk.modelcontextprotocol.io/v2/serving/legacy-clients.html
