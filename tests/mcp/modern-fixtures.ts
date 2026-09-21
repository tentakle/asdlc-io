import type { Article } from "../../src/mcp/content.ts";
export const VERSION = "2026-07-28";
export const article: Article = {
  slug: "context-engineering",
  collection: "concepts",
  title: "Context Engineering",
  description: "Building context for agents",
  status: "Live",
  content: "## Context\nUseful knowledge.",
};
interface TestMessage {
  jsonrpc: string;
  id: unknown;
  method: string;
  params: Record<string, unknown> & { _meta: Record<string, unknown> };
}
export function message(
  method = "tools/call",
  params: Record<string, unknown> = { name: "get_article", arguments: { slug: article.slug } },
  id: unknown = 1,
): TestMessage {
  return {
    jsonrpc: "2.0",
    id,
    method,
    params: {
      ...params,
      _meta: {
        "io.modelcontextprotocol/protocolVersion": VERSION,
        "io.modelcontextprotocol/clientCapabilities": {},
      },
    },
  };
}
export function request(body = message(), headers: Record<string, string> = {}) {
  return new Request("https://asdlc.io/mcp", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      "MCP-Protocol-Version": VERSION,
      "Mcp-Method": body.method,
      ...(typeof body.params.name === "string" ? { "Mcp-Name": body.params.name } : {}),
      ...headers,
    },
    body: JSON.stringify(body),
  });
}
