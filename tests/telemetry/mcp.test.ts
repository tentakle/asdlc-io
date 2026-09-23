import { afterEach, describe, expect, it, vi } from "vitest";
import { ContentService } from "../../src/mcp/content.ts";
import { createKnowledgeBaseHandler } from "../../src/mcp/server.ts";
import { article, message, request } from "../mcp/modern-fixtures.ts";
import type { Observation } from "../../src/lib/telemetry/event.ts";

afterEach(() => vi.restoreAllMocks());
describe("MCP observation", () => {
  it("observes structured search, retrieval, recipes and listing without leaking metadata to callers", async () => {
    const service = new ContentService([article, { ...article, slug: "critic", collection: "recipes" }]);
    const observer = vi.fn<(value: Observation) => void>();
    const endpoint = createKnowledgeBaseHandler(service, { allowedOrigins: [] }, observer);
    const spy = vi.spyOn(service, "searchArticles");
    try {
      for (const [name, args] of [["search_knowledge_base", { query: "context" }], ["get_article", { slug: "critic" }], ["list_articles", {}]] as const) {
        const response = await endpoint.fetch(request(message("tools/call", { name, arguments: args })));
        const body = await response.json();
        expect(response.status).toBe(200);
        expect(body.result).not.toHaveProperty("telemetry");
        expect(body.result.content[0].text).toBeTruthy();
      }
      expect(spy).toHaveBeenCalledExactlyOnceWith("context");
      expect(observer).toHaveBeenCalledTimes(3);
      expect(observer.mock.calls[0][0]).toMatchObject({ operation: "search", query: "context", articleIds: expect.arrayContaining(["recipes/critic", "concepts/context-engineering"]) });
      expect(observer.mock.calls[1][0]).toMatchObject({ operation: "retrieve", resultCount: 1, articleIds: ["recipes/critic"] });
      expect(observer.mock.calls[2][0]).toMatchObject({ operation: "list", resultCount: 2, articleIds: [] });
    } finally { await endpoint.close(); }
  });
  it("classifies known-tool errors but omits unknown tools, catalog calls and protocol rejection", async () => {
    const service = new ContentService([article]);
    const observer = vi.fn<(value: Observation) => void>();
    const endpoint = createKnowledgeBaseHandler(service, { allowedOrigins: [] }, observer);
    try {
      await endpoint.fetch(request(message("tools/call", { name: "get_article", arguments: {} })));
      await endpoint.fetch(request(message("tools/call", { name: "get_article", arguments: { slug: "missing" } })));
      vi.spyOn(service, "searchArticles").mockRejectedValue(new Error("private secret"));
      const failureResponse = await endpoint.fetch(request(message("tools/call", { name: "search_knowledge_base", arguments: { query: "context" } })));
      expect((await failureResponse.json()).error.code).toBe(-32603);
      await endpoint.fetch(request(message("tools/call", { name: "unknown" })));
      await endpoint.fetch(request(message("tools/list", {})));
      await endpoint.fetch(request(message(), { "MCP-Protocol-Version": "2024-11-05" }));
      expect(observer.mock.calls.map(([value]) => value.failureCategory)).toEqual(["invalid_arguments", "article_unavailable", "execution_error"]);
      expect(observer.mock.calls.every(([value]) => value.resultCount === null)).toBe(true);
    } finally { await endpoint.close(); }
  });
  it("contains observer errors and preserves retrieval", async () => {
    const endpoint = createKnowledgeBaseHandler(new ContentService([article]), { allowedOrigins: [] }, () => { throw new Error("telemetry failed"); });
    try {
      const response = await endpoint.fetch(request());
      expect(response.status).toBe(200);
      expect((await response.json()).result.isError).not.toBe(true);
    } finally { await endpoint.close(); }
  });
});
