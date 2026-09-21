---
title: "MCP Transport — Modern Stateless HTTP"
status: "draft"
owner: "Ville Takanen"
linear: "AL-101"
archetype: "infra"
created: "2026-09-21"
tags: ["MCP", "HTTP", "Interoperability"]
---

# Feature: MCP Transport — Modern Stateless HTTP

## Blueprint

### Context

Agents need a conforming access path to ASDLC's knowledge base. The existing
endpoint advertises `2024-11-05`; this contract defines its replacement under
accepted [ADR 0004](../../docs/adrs/0004-mcp-stateless-transport.md). After cutover,
`2026-07-28` is the sole supported revision. Legacy clients must upgrade.

This is a target contract, not evidence that the upgrade is deployed. AL-50 owns
implementation; AL-102 owns deployed interoperability. Retrieval quality remains
governed by the [MCP eval contract](../mcp-evals/spec.md).

### Architecture

| Boundary | Responsibility and location |
| --- | --- |
| Public HTTP endpoint | `/mcp` on Netlify Edge; `netlify/edge-functions/mcp.ts` owns deployment routing and browser policy. |
| Protocol adapter | `src/mcp/server.ts` owns the boundary between validated MCP messages and tools. Prefer the official SDK v2 web-standard handler in modern-only mode, as decided in ADR 0004. |
| Tool behavior | `src/mcp/tools.ts` defines the three existing tools; `src/mcp/content.ts` owns retrieval. Wire-format changes preserve content behavior. |
| Data | `src/content/config.ts` defines article data. `scripts/generate-mcp-index.mjs` produces `src/mcp/articles.json` and `src/mcp/fuse-index.json` for a deployment. |
| Local verification | `tests/mcp/server.test.ts`, `tests/mcp/mcp.edge.test.ts`, and `tests/mcp/content.test.ts`. |
| Deployment verification | `scripts/test-deploy-preview.mjs`, supported client runs, and configuration guidance in [README.md](../../README.md). |

The adapter depends on the content/tool layer. Retrieval remains callable without
HTTP. Immutable index reuse is permitted; request context is independent of
connection, prior discovery, and edge instance.

### Protocol profile

The linked [normative schema][schema] owns full message definitions. This spec
selects ASDLC's behavior rather than copying the schema or SDK implementation.

**Request contract.** Each RPC has a string or integer ID and modern metadata in
`params._meta`: `io.modelcontextprotocol/protocolVersion` and
`io.modelcontextprotocol/clientCapabilities` are required. An empty capability
object suffices for our tools. `clientInfo` is optional; omission succeeds and a
malformed value fails validation. Identity is descriptive, never a dispatch or
authorization key. Responses correlate IDs and carry either error or result;
completed results include `resultType: "complete"`. Include the server's name
and deployed software version in result metadata. [Base protocol][basic]

**HTTP binding.** RPCs use POST with JSON content and the standard Accept values.
Require `MCP-Protocol-Version`, `Mcp-Method`, and, for tool calls, `Mcp-Name`.
Compare them with their corresponding body values, including standardized
Base64 decoding where applicable. Successful requests return 200 and JSON.
GET/DELETE and other unsupported HTTP methods return 405 with
`Allow: POST, OPTIONS`. Origin validation precedes method handling.
[Streamable HTTP][http]

**Discovery.** `server/discover` returns only `2026-07-28` in `supportedVersions`
and advertises tools. It is optional for clients: a correctly formed first
request can list or invoke a tool. Discovery describes the same public surface
for every caller. [Discovery][discover]

**Tools.** `tools/list` returns exactly `list_articles`, `get_article`, and
`search_knowledge_base`, with valid input schemas and deterministic ordering.
`tools/call` preserves the input meanings and text payloads in
`src/mcp/tools.ts`. Schema-invalid tool arguments and an unavailable article
produce actionable tool results with `isError: true`; unknown tool names and
malformed call envelopes are protocol errors. Listing and search expose only
Live/Experimental content, and retrieval cannot expose other statuses.
[Tool contract][tools]

**Cache policy.** Discovery and tool-list completed results include
`ttlMs: 300000` and `cacheScope: "public"`. Five minutes limits catalog staleness
after deployment while avoiding repeated discovery during ordinary use. The
catalog is caller-independent; changes become visible on a fresh request.
These are MCP client-cache hints, not permission to reuse an HTTP JSON-RPC
response with another request ID. Set HTTP `Cache-Control: no-store` on RPC
responses; tool executions receive no catalog cache hints.
[MCP caching][caching]

**Selected capabilities.** This service exposes tools only. It completes calls
without elicitation, sampling, tasks, prompts, resources, subscriptions, or
streaming. Advertise no optional extensions or list-change notifications.
Capabilities that callers offer do not oblige the server to use them. Requests
for unimplemented methods receive the method error below. Unused protocol
features remain outside this feature's implementation scope.

### Rejection and error contract

Validation completes before a tool executes. The table describes isolated
failures in otherwise valid requests; multiply-invalid requests may report the
first applicable failure, but always fail before dispatch. HTTP status choices
for general JSON-RPC failures below are ASDLC policy where MCP leaves latitude.

| Condition | Observable result |
| --- | --- |
| Non-JSON Content-Type | 415; no tool execution. |
| Accept does not allow both standard response media types | 406; no tool execution. |
| Unparseable JSON | 400, JSON-RPC `-32700`. |
| Invalid envelope, batch array, response-shaped input, or invalid ID | 400, `-32600`; omit an unreadable/invalid ID. |
| Missing/mismatched required HTTP routing header | 400, `-32020` (HeaderMismatch). |
| Required body metadata missing/malformed | 400, `-32602`. |
| Matching header/body declare an unsupported revision | 400, `-32022`, naming only `2026-07-28` as supported. |
| Unknown RPC method with valid modern metadata | 404, `-32601`. |
| Unknown tool name or malformed tool-call envelope | 400, `-32602`. |
| Known tool with invalid arguments or missing/unpublished article | 200, completed tool result with `isError: true` and useful text. |
| Unexpected server failure | 500, `-32603`, with no stack trace or internal details. |

Error meanings follow the [base error definitions][basic], [version rules][versioning],
and [HTTP binding][http]. Tool results distinguish domain failures from malformed
protocol requests, following the [tool error model][tools].

**Legacy boundary.** Reject `initialize` and all requests declaring any 2024/2025
revision. A legacy-shaped initialization lacking modern headers returns 400 and
a diagnostic naming the supported revision; its code can reflect either missing
headers or the recognized unsupported legacy version. A fully modern envelope
calling `initialize` receives the unknown-method result. SDK defaults never
enable legacy dispatch. Session and replay headers neither establish context nor
relax validation. [Version compatibility][versioning]

**Notifications.** Well-formed notification envelopes are accepted and discarded
with 202 and an empty body. This applies to `notifications/initialized` too: it
establishes no session and enables no subsequent call. An ID-less `tools/call`
never executes a tool. Malformed notification envelopes return 400 without a
JSON-RPC response ID. Notification acknowledgment is transport disposal, not
legacy protocol service; this is compatible with the SDK's strict-mode handling.
[SDK notification behavior][sdk-legacy]

### Public access and browser policy

Access is anonymous and read-only. Apply ADR 0004's Origin policy to POST,
OPTIONS, and errors: absent Origin is allowed; valid browser origins must match
the configured exact allowlist. Production starts with `https://asdlc.io`;
preview adds only its own origin. Local development origins are explicit and
isolated from production. Null, malformed, or unlisted origins receive 403
before parsing or tool execution, without an allow-origin grant.

For an allowed Origin, return that origin in `Access-Control-Allow-Origin` and
vary responses by Origin. Preflight for POST succeeds with 204 and permits
Content-Type, Accept, MCP-Protocol-Version, Mcp-Method, and Mcp-Name, matching
header names case-insensitively. Reject preflight requesting other methods or
headers with 403. CORS success/errors do not grant credentials. The allowlist
comes from trusted deployment configuration, not request Host/Origin reflection.

### Deployment constraints

The deployed path stays `/mcp`; cutover and rollback both preserve modern-only
service. No side endpoint or negotiated downgrade serves legacy requests.
Exact SDK dependencies require the repository's dependency approval, and the
selected handler must bundle and run on Netlify Edge. A failure to fit that
runtime returns to ADR review rather than silently changing the hosting model.

## Contract

### Definition of Done

- [x] Local protocol tests cover the request, response, error, and browser tables.
- [x] Discovery and direct calls work on fresh independent instances with only
      the current request's metadata; no session identifier is issued.
- [x] Legacy rejection tests prove tool dispatch count remains zero.
- [x] Discovery/catalog cache hints and deterministic ordering match this profile.
- [x] Existing retrieval evals pass against a freshly generated index, and
      content/status behavior remains unchanged.
- [x] The SDK adapter bundles for Netlify Edge.
- [ ] The adapter passes deployed preview checks (AL-102).
- [ ] Supported-client evidence records exact versions, negotiated revision,
      preview URL, deployment revision, and discovery/list/search/get outcomes.
- [ ] README configuration states the modern revision requirement and verified
      clients; `pnpm check`, relevant MCP tests, evals, and build pass.

These boxes track feature implementation, not completion of spec authoring.

AL-50 local evidence (2026-09-21): SDK `@modelcontextprotocol/server@2.0.0`;
185 unit tests and 18 retrieval evals pass. `pnpm check`, lint, and the full
`netlify build --offline` pass with Netlify CLI `27.5.2`. Netlify Dev's local
Edge runtime successfully serves discovery, listing, search, and retrieval;
legacy calls, GET, and an unlisted Origin are rejected. This is local evidence,
not deployed host certification. The SDK's low-level `Server` API is retained
for explicit protocol/domain error separation; its deprecation appears as two
non-failing type-check hints. The adapter remaps SDK dispatch-error HTTP statuses
to the table above and blocks the SDK's built-in subscription route.

### Scenarios

```gherkin
Scenario: A client discovers the service
  Given a fresh instance and valid modern request metadata
  When the client calls server/discover
  Then only 2026-07-28 and the tools capability are advertised
  And the completed response carries identity and the catalog cache policy

Scenario: An agent retrieves an article across independent instances
  Given two instances loaded with the same manifest
  When the first request searches for context engineering on instance A
  And a request retrieves a returned slug on instance B without discovery
  Then both requests succeed using their own metadata
  And the article text matches the content-layer result

Scenario Outline: Invalid requests never reach a tool
  Given a valid tool request with "<defect>" as its only defect
  When the endpoint processes the request
  Then it returns the table's status and error category
  And tool dispatch count is zero
  Examples:
    | defect |
    | unsupported revision in matching header and body |
    | missing protocol version header |
    | mismatched method header |
    | mismatched or malformed encoded name header |
    | missing required body capabilities |
    | invalid request ID |
    | unknown tool name |

Scenario: Optional identity and encoded headers are handled correctly
  Given a valid tool request without clientInfo
  And Mcp-Name encodes the correct tool name with the standard Base64 sentinel
  When the request is handled
  Then it succeeds with the same result as the plain-header request

Scenario: Legacy initialization does not enable later calls
  Given a client using any 2024 or 2025 protocol revision
  When it initializes and then tries to call a tool
  Then initialization and the tool request fail
  And a notifications/initialized message is discarded with an empty 202
  And no request executes a tool or creates a session

Scenario: Invalid tool arguments differ from unavailable content
  Given valid modern envelopes for get_article
  When one call supplies a non-string slug and another a nonexistent slug
  Then both return completed error tool results with actionable text
  And neither leaks unpublished content or produces an internal-error response

Scenario: Browser grants follow configured origins
  Given a configured preview origin and an unrelated Netlify preview origin
  When each sends a preflight for the required POST headers
  Then only the configured origin receives a 204 and matching CORS grant
  And the other receives 403 before dispatch
  And native requests without Origin still work

Scenario: Catalog freshness does not cache JSON-RPC envelopes
  Given repeated discovery and tools/list requests with distinct IDs
  When requests reach the same deployment
  Then catalogs and ordering agree and each response echoes its own ID
  And only catalog results carry the five-minute public MCP hint
  And HTTP responses prohibit envelope storage

Scenario: Cutover has no legacy serving path
  Given the upgraded deployment
  When a client opens GET /mcp or requests a legacy revision
  Then no SSE endpoint event or legacy tool result is available
  And deployment rollback preserves the modern-only boundary
```

### Verification ownership

AL-50 maps each scenario and error-table row to local tests, including invalid
origins, preflight failures, notification disposal, no-ID tool calls, and
unexpected exceptions. It proves content parity through the existing
[retrieval eval suite](../mcp-evals/spec.md); broader intent coverage is AL-78.

AL-102 runs the preview script and an actual host. Initial targets from ADR 0004
are Claude Code **2.1.278** and official TypeScript client **2.0.0**; record and
justify replacement versions if necessary. Both are **unverified against this
endpoint** today. Record the Claude runtime mode and actual negotiated revision.
Fixtures alone cannot certify a host, and a passing local test cannot certify
the edge deployment. All supported legacy-version claims are excluded.

## Normative references

Sources checked 2026-09-21. The revision-specific schema resolves wire-shape
questions; SDK defaults do not override this project's selected profile.

[schema]: https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/schema/2026-07-28/schema.ts
[basic]: https://modelcontextprotocol.io/specification/2026-07-28/basic
[http]: https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http
[versioning]: https://modelcontextprotocol.io/specification/2026-07-28/basic/versioning
[discover]: https://modelcontextprotocol.io/specification/2026-07-28/server/discover
[tools]: https://modelcontextprotocol.io/specification/2026-07-28/server/tools
[caching]: https://modelcontextprotocol.io/specification/2026-07-28/server/utilities/caching
[sdk-legacy]: https://ts.sdk.modelcontextprotocol.io/v2/serving/legacy-clients.html
