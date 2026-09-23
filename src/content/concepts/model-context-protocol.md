---
title: Model Context Protocol (MCP)
longTitle: "Model Context Protocol: Stateless Requests, Tools, and Context"
description: "Open protocol connecting AI applications to external tools and data through self-contained requests. Protocol state, retrieval timing, and content freshness are separate concerns."
tags:
  - Infrastructure
  - Standards
  - Interoperability
  - AI Agents
  - Context Engineering
status: "Live"
relatedIds: ["concepts/context-engineering", "concepts/agent-skills", "patterns/the-spec", "patterns/context-gates", "patterns/agent-constitution", "practices/agents-md-spec", "practices/workflow-as-code"]
lastUpdated: 2026-09-21
references:
  - type: website
    title: "Model Context Protocol Specification — 2026-07-28"
    author: "Model Context Protocol"
    url: "https://modelcontextprotocol.io/specification/2026-07-28"
    accessed: 2026-09-21
    annotation: "Authoritative revision defining the host/client/server roles and optional server features. The date identifies the protocol revision."
  - type: website
    title: "Base Protocol — Overview"
    author: "Model Context Protocol"
    url: "https://modelcontextprotocol.io/specification/2026-07-28/basic"
    accessed: 2026-09-21
    annotation: "Defines stateless requests, required per-request version and capabilities, optional client identity, and explicit identifiers for application state."
  - type: website
    title: "Discovery"
    author: "Model Context Protocol"
    url: "https://modelcontextprotocol.io/specification/2026-07-28/server/discover"
    accessed: 2026-09-21
    annotation: "Servers implement server/discover; clients may use it to inspect versions and capabilities or invoke other RPCs directly."
  - type: website
    title: "Versioning and Compatibility"
    author: "Model Context Protocol"
    url: "https://modelcontextprotocol.io/specification/2026-07-28/basic/versioning"
    accessed: 2026-09-21
    annotation: "Distinguishes modern per-request metadata from legacy initialization and describes optional support for both protocol eras."
  - type: website
    title: "Streamable HTTP"
    author: "Model Context Protocol"
    url: "https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http"
    accessed: 2026-09-21
    annotation: "Defines POST requests, JSON or request-scoped streaming responses, and removal of protocol sessions and the standalone GET stream."
  - type: website
    title: "Tools"
    author: "Model Context Protocol"
    url: "https://modelcontextprotocol.io/specification/2026-07-28/server/tools"
    accessed: 2026-09-21
    annotation: "Defines tool discovery and invocation, input schemas, capability declarations, and application responsibilities for safe tool use."
  - type: website
    title: "AGENTS.md outperforms skills in our agent evals"
    author: "Jude Gao"
    publisher: "Vercel"
    url: "https://vercel.com/blog/agents-md-outperforms-skills-in-our-agent-evals"
    published: 2026-01-27
    accessed: 2026-09-21
    annotation: "Next.js 16 evaluation comparing a persistent documentation index with skill-triggered retrieval; not a direct evaluation of MCP transports."
---

## Definition

The **Model Context Protocol (MCP)** is an open protocol connecting AI applications to external tools, data sources, and services. It standardizes communication between a host application, its client connectors, and servers that expose capabilities. Compatibility depends on shared protocol versions and supported features; a connector is not automatically usable by every AI application. This article describes revision **2026-07-28** of the [specification](https://modelcontextprotocol.io/specification/2026-07-28).

## Key Characteristics

### Self-contained requests

MCP uses JSON-RPC 2.0. In the 2026-07-28 revision, each request carries the protocol version and client capabilities needed to process it. Client identity is optional. The server must not infer those properties from earlier requests or from the connection carrying them. State spanning requests, such as an application task, is referenced through explicit identifiers supplied by the client. Statelessness therefore does not mean that the underlying application cannot store data or perform state-changing operations. [Base protocol](https://modelcontextprotocol.io/specification/2026-07-28/basic)

### Discovery and capabilities

Servers implement `server/discover`, which exposes supported versions, capabilities, and server information. Calling it is optional for clients: a client can issue another valid RPC directly and handle an unsupported-version error. Discovery describes what a server offers; it does not establish a session required by later calls. [Discovery](https://modelcontextprotocol.io/specification/2026-07-28/server/discover)

Servers may expose tools, resources, or prompts. A tool is a callable operation with a name and input schema; resources supply context, while prompts supply reusable message templates. These features are optional, so a tools-only server need not implement resource or prompt access. [Specification](https://modelcontextprotocol.io/specification/2026-07-28)

### Transport and version boundaries

Modern Streamable HTTP sends each request through POST and permits either a JSON response or an SSE response stream associated with that request. Revision 2026-07-28 removes protocol-level sessions and the standalone GET stream; it does not remove all streaming. [Streamable HTTP](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http)

Earlier revisions, including 2025-11-25, use an initialization handshake. Implementations may support both eras, but compatibility is a deliberate implementation choice. An HTTP endpoint alone does not prove that a client and server share a protocol revision. Integrations must check version support and the capabilities their workflow requires. [Versioning and compatibility](https://modelcontextprotocol.io/specification/2026-07-28/basic/versioning)

## Static Content, Retrieval, and Freshness

Three independent questions determine how context reaches an agent:

| Dimension | Question | Example |
| --- | --- | --- |
| Protocol state | Does this request depend on an earlier protocol exchange? | A modern MCP request supplies its own version and capabilities. |
| Retrieval timing | When is information selected for the task? | A search tool selects relevant documents when invoked. |
| Content freshness | When was the underlying information updated? | A documentation index reflects its last build; a database query reflects the data visible when executed. |

These distinctions follow from separating the protocol contract from the data source. A server can search a fixed documentation snapshot at query time. Its execution is dynamic, its protocol is stateless, and its content remains unchanged until the snapshot is replaced. Conversely, a stateless request can read changing issue-tracker data. Neither case makes freshness a property guaranteed by MCP.

A static file can also be updated frequently or read on demand. “Static” should identify whether the discussion concerns storage, publication, or prompt inclusion, rather than imply that all file-based knowledge is permanent.

## Static vs. Dynamic Context

The useful choice is between information that should remain available throughout a task and information selected when needed. [AGENTS.md](/practices/agents-md-spec) can carry concise repository instructions and a documentation index; [Specs](/patterns/the-spec) preserve feature intent. Tool-based retrieval can select a small relevant subset of a larger corpus, whether that corpus is stable or frequently updated.

### The Vercel finding

In its January 2026 Next.js 16 evaluation, Vercel reported a 100% pass rate with a compressed documentation index in `AGENTS.md`, compared with 79% for a skill explicitly instructed to retrieve documentation. The index pointed to local documentation that the agent could read as needed; it did not embed all documentation. This was a comparison of context-delivery strategies in a particular evaluation, not an MCP transport benchmark or proof that stable knowledge should never be retrieved through tools. [Vercel evaluation](https://vercel.com/blog/agents-md-outperforms-skills-in-our-agent-evals)

A practical heuristic is to keep essential constraints readily available and retrieve supporting material selectively. Corpus size, relevance, access controls, update cadence, and retrieval reliability all affect that choice. [Agent Skills](/concepts/agent-skills) package procedures; MCP supplies an interface through which tools and data can be accessed. The mechanisms can be combined.

## Context Budget and Implementation Quality

Tool descriptions, schemas, and returned data occupy context when the host presents them to the model. The size of that context depends on the host's loading strategy and the server's interface, not simply on whether MCP is used. `server/discover` summarizes capabilities; it does not itself guarantee selective loading of tool definitions into a model's prompt.

Focused tool descriptions and bounded results help make available operations understandable. Tool catalogs are obtained through `tools/list`, and operations run through `tools/call`. The protocol defines these interfaces but does not mandate a single user interaction model. [Tool specification](https://modelcontextprotocol.io/specification/2026-07-28/server/tools)

## Security and Governance Boundaries

Protocol conformance does not establish that retrieved content is trustworthy or that an operation is appropriate. Hosts and servers retain responsibility for consent, access controls, and safe tool execution. External text and tool descriptions can contain untrusted instructions. [Specification security principles](https://modelcontextprotocol.io/specification/2026-07-28#security-and-trust-safety)

Stateless requests do not remove these obligations. HTTP deployments must validate request origins, and authorization must match the service's access requirements. Origin validation and authorization address different boundaries. [HTTP security requirements](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http#security-endpoint)

## ASDLC Usage

MCP is one delivery mechanism within [Context Engineering](/concepts/context-engineering): it can expose stable knowledge as well as changing external data. [Context Gates](/patterns/context-gates) validate material crossing workflow boundaries, [Workflow as Code](/practices/workflow-as-code) controls operation sequencing, and an [Agent Constitution](/patterns/agent-constitution) records persistent behavioral constraints. Those responsibilities remain necessary regardless of the protocol used to retrieve context.
