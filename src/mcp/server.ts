import {
  classifyInboundRequest,
  createMcpHandler,
  isJsonContentType,
  ProtocolError,
  Server,
} from "@modelcontextprotocol/server";
import packageInfo from "../../package.json" with { type: "json" };
import {
  failure,
  type Observation,
  type Observer,
  type Operation,
} from "../lib/telemetry/event.ts";
import type { ContentService } from "./content.ts";
import { checkHttpPolicy, type McpHttpPolicy, withHttpPolicy } from "./http-policy.ts";
import { handleToolCall, TOOLS } from "./tools.ts";

export const PROTOCOL_VERSION = "2026-07-28";
const CACHE_HINT = { ttlMs: 300000, cacheScope: "public" as const };
const METHODS = new Set(["server/discover", "tools/list", "tools/call"]);

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function errorResponse(
  status: number,
  code: number,
  message: string,
  id?: string | number,
): Response {
  return Response.json(
    { jsonrpc: "2.0", ...(id !== undefined && { id }), error: { code, message } },
    { status },
  );
}

/** Each SDK exchange constructs a fresh protocol server; only retrieval data is reused. */
export function createKnowledgeBaseHandler(
  contentService: ContentService,
  policy: McpHttpPolicy,
  observer?: Observer,
) {
  const sdk = createMcpHandler(
    () => {
      // Low-level registration preserves protocol errors; the high-level tool helper
      // converts unexpected exceptions to domain results, contrary to our HTTP contract.
      const server = new Server(
        { name: "asdlc-knowledge-base", version: packageInfo.version },
        {
          capabilities: { tools: {} },
          cacheHints: { "server/discover": CACHE_HINT, "tools/list": CACHE_HINT },
        },
      );
      server.removeRequestHandler("initialize");
      server.removeRequestHandler("ping");
      server.setRequestHandler("tools/list", () => ({ tools: TOOLS }));
      server.setRequestHandler("tools/call", async ({ params }) => {
        const tool = TOOLS.find((candidate) => candidate.name === params.name);
        if (!tool) throw new ProtocolError(-32602, `Unknown tool: ${params.name}`);
        const operation: Operation =
          params.name === "get_article"
            ? "retrieve"
            : params.name === "search_knowledge_base"
              ? "search"
              : "list";
        const observe = (value: Observation) => {
          try {
            observer?.(value);
          } catch {
            /* Telemetry never becomes a tool error. */
          }
        };
        const args = params.arguments ?? {};
        const required = tool.inputSchema.required ?? [];
        const invalid = required.find((key) => typeof args[key] !== "string" || args[key] === "");
        if (invalid) {
          observe(failure(operation, "invalid_arguments"));
          return {
            content: [
              { type: "text" as const, text: `Parameter '${invalid}' must be a non-empty string.` },
            ],
            isError: true,
          };
        }
        const strings: Record<string, string> = {};
        for (const key of required) {
          const value = args[key];
          if (typeof value === "string") strings[key] = value;
        }
        let execution: Awaited<ReturnType<typeof handleToolCall>>;
        try {
          execution = await handleToolCall(params.name, strings, contentService);
        } catch {
          observe({
            ...failure(operation, "execution_error"),
            ...(operation === "search" ? { query: strings.query } : {}),
          });
          throw new ProtocolError(-32603, "Internal server error");
        }
        const { telemetry, ...response } = execution;
        observe({ ...telemetry, ...(operation === "search" ? { query: strings.query } : {}) });
        return response;
      });
      return server;
    },
    { legacy: "reject", responseMode: "json" },
  );

  async function handle(request: Request): Promise<Response> {
    const terminal = checkHttpPolicy(request, policy);
    if (terminal) return terminal;
    if (!isJsonContentType(request.headers.get("Content-Type")))
      return errorResponse(415, -32000, "Content-Type must be application/json");
    const accept = request.headers.get("Accept") ?? "";
    if (
      !["application/json", "text/event-stream"].every((type) =>
        accept.split(",").some((entry) => {
          const [media, ...parameters] = entry.trim().split(";");
          return (
            media === type &&
            !parameters.some((parameter) => /^\s*q=0(?:\.0*)?\s*$/.test(parameter))
          );
        }),
      )
    )
      return errorResponse(406, -32000, "Accept must allow application/json and text/event-stream");
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return errorResponse(400, -32700, "Parse error");
    }
    const id =
      record(body) &&
      (typeof body.id === "string" || (typeof body.id === "number" && Number.isInteger(body.id)))
        ? body.id
        : undefined;
    if (record(body) && "id" in body && id === undefined)
      return errorResponse(400, -32600, "Invalid request ID");
    const route = classifyInboundRequest({
      httpMethod: request.method,
      protocolVersionHeader: request.headers.get("MCP-Protocol-Version") ?? undefined,
      mcpMethodHeader: request.headers.get("Mcp-Method") ?? undefined,
      mcpNameHeader: request.headers.get("Mcp-Name") ?? undefined,
      body,
    });
    // Notifications are disposal only, even when their method names a tool.
    if (
      (route.kind === "modern" && route.messageKind === "notification") ||
      (route.kind === "legacy" && route.reason === "notification")
    )
      return new Response(null, { status: 202 });
    if (id !== undefined && !request.headers.has("MCP-Protocol-Version"))
      return errorResponse(
        400,
        -32020,
        `MCP-Protocol-Version is required; supported: ${PROTOCOL_VERSION}`,
        id,
      );
    // The SDK has a built-in subscription router; this endpoint intentionally has none.
    if (
      route.kind === "modern" &&
      route.messageKind === "request" &&
      !METHODS.has(route.message.method)
    )
      return errorResponse(404, -32601, "Method not found", id);
    const response = await sdk.fetch(request, { parsedBody: body });
    // SDK dispatch errors use HTTP 200; apply this endpoint's explicit status policy.
    if (response.headers.get("Content-Type")?.includes("application/json")) {
      const value: unknown = await response.json();
      if (record(value)) {
        if (id === undefined) delete value.id;
        if (record(value.error)) {
          const code = value.error.code;
          const status =
            code === -32603
              ? 500
              : code === -32601
                ? 404
                : response.status === 200
                  ? 400
                  : response.status;
          if (code === -32603) value.error = { code, message: "Internal server error" };
          return Response.json(value, { status, headers: response.headers });
        }
      }
      return Response.json(value, { status: response.status, headers: response.headers });
    }
    return response;
  }
  return {
    async fetch(request: Request): Promise<Response> {
      return withHttpPolicy(await handle(request), request.headers.get("Origin"), policy);
    },
    close: () => sdk.close(),
  };
}
