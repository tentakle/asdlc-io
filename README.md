# ASDLC.io: Determinism over Vibes

**ASDLC.io** is the definitive knowledge base for the **Agentic Software Development Life Cycle (ASDLC)**. It provides a structured repository of concepts, patterns, and practices designed to bring engineering rigor to the collaboration between human developers and AI agents.

---

## Philosophy: The Industrialization of Software

> "Agentic architecture is the conveyor belt for knowledge work."

For 50 years, software development has been a **Craft**—dependent on individual artisans, manual tooling, and implicit knowledge. ASDLC.io documents the principles, patterns, and standards for transitioning to **Industrial** software engineering.

### The Core Insight

**Agents do not replace humans; they industrialize execution.**

Just as robotic arms automate welding without replacing manufacturing expertise, agents automate high-friction parts of knowledge work (logistics, syntax, verification) while humans focus on intent, architecture, and governance.

### What This Means

- **Agents are the logistic layer** — Moving information, verifying specs, executing tests
- **Context is the supply chain** — Just-in-Time delivery of requirements, schemas, and code
- **Standardization is mandatory** — Schemas, typed interfaces, deterministic protocols

We're not building "AI coding assistants." We're documenting the blueprints for the **software factory**.

There is no single right answer to building these systems; thus, **optionality is a feature**, not a bug. Patterns in architecture and software engineering gave us a shared, opinionated vocabulary of composable building blocks. ASDLC.io maps the vocabulary of the **Agentic era**.

**Read the full vision:** [docs/vision.md](./docs/vision.md)

### Determinism over Vibes

Fluency in agentic coding requires both mastery of steering (vibes) and the implementation of deterministic tools:

- **Schema-First Development**: Defining data contracts (Zod) before generating content
- **Strict Logic**: Enforcing code quality and architectural rules at the source
- **Docs-as-Code**: Maintaining the knowledge base with the same rigor as production software

**Determinism arises from tools, not prompts.** `AGENTS.md` steers the agent, but only schemas and tests ensure compliance.

## Key Features

- **Model Context Protocol (MCP)**: A built-in server that allows AI agents to directly browse and search this knowledge base via the `/mcp` endpoint.
- **Downloadable Static Skill**: A self-contained bundle of the knowledge base designed for offline or local-first agentic workflows.
- **Content Layer Architecture**: Powered by Astro 5.x for lightning-fast, schema-validated static content.
- **Edge Deployment**: MCP functionality runs on Netlify Edge Functions for global availability.

## Getting Started

### Prerequisites

- **Node.js**: v18.x or higher
- **pnpm**: The exclusive package manager for this project

### Installation

```bash
pnpm install
```

### Commands

| Command | Description |
|---|---|
| `pnpm dev` | Start the local dev server at `localhost:4321` |
| `pnpm build` | Full production build (type check + static site + skill bundle) |
| `pnpm check` | Run Astro type checking |
| `pnpm lint` | Lint and auto-fix with Biome |
| `pnpm test:run` | Run the Vitest test suite |
| `pnpm diagrams` | Render Mermaid diagrams to SVG |
| `pnpm build:mcp-index` | Rebuild the MCP article manifest (`src/mcp/articles.json`) |
| `pnpm build:skill` | Generate the downloadable skill artifact at `dist/skill/` |

## Model Context Protocol (MCP)

This project is more than just a website; it is an MCP server.

- **Endpoint**: `https://asdlc.io/mcp`
- **Transport after cutover**: stateless Streamable HTTP, JSON responses, MCP `2026-07-28` only. No legacy initialization, SSE endpoint, sessions, or downgrade path.
- **Architecture**: official TypeScript server SDK `2.0.0` over a build-time content manifest, packaged for Netlify Edge.
- **Request requirements**: POST JSON with `Accept: application/json, text/event-stream`, `MCP-Protocol-Version`, `Mcp-Method`, and `Mcp-Name` for tool calls. Each request supplies protocol-version and client-capability metadata; discovery is optional.
- **Contract**: [MCP transport](./specs/mcp-transport/spec.md).
- **Verified on preview**: TypeScript client `@modelcontextprotocol/client@2.0.0`, pinned to `2026-07-28`, completes discovery/list/search/get. See the [dated evidence and deployment revision](./docs/verification/mcp-2026-09-21.md). Claude Code `2.1.278` remains **unverified**, as do the other editor setup examples. Production cutover is pending.

Verify a deployment with both the wire script and the actual reference client:

```bash
pnpm test:mcp-preview <preview-url> <deployed-commit>
pnpm test:mcp-client <preview-url> <deployed-commit>
```

The SDK client requires explicit modern negotiation; its default is legacy:

```js
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
const client = new Client(
  { name: "asdlc-reader", version: "1.0.0" },
  { versionNegotiation: { mode: { pin: "2026-07-28" } } },
);
await client.connect(new StreamableHTTPClientTransport(new URL("<preview-url>/mcp")));
```

For a future Claude Code check, use HTTP configuration and launch with
`MCP_SDK_GENERATION=v2 MCP_PROTOCOL_NEGOTIATION=auto claude`. These controls are
[documented by Anthropic](https://code.claude.com/docs/en/mcp#mcp-client-runtimes);
they are not evidence that Claude has passed this endpoint's checks.

Browser access permits `https://asdlc.io` exactly; native clients may omit Origin.
For a deploy preview, set `MCP_PREVIEW_ORIGIN` to that preview's exact HTTPS
origin in Netlify environment configuration with **Functions** scope. It is read
only when Netlify reports `deploy-preview`; other preview origins remain denied.
Local development can set `MCP_LOCAL_ORIGIN` (for example
`http://localhost:4321`) in the `dev` context. Production ignores both variables.
These settings use [Netlify's Edge environment API](https://docs.netlify.com/build/edge-functions/api/),
not request Host or Origin reflection. Never add wildcard preview grants.

Cutover requires AL-102's deployment evidence. Rollback must keep the modern-only
boundary; if no known-good modern deployment exists, disable `/mcp` or fix forward
instead of restoring the legacy handler.

## Testing & Validation

All logic is strictly tested using **Vitest**.

```bash
pnpm test:run
```
Runs the consolidated test suite located in `./tests`.

## AI Contributor Protocol

If you are an AI agent contributing to this project, please read [AGENTS.md](./AGENTS.md) first for detailed personas, coding standards, and operational boundaries.
