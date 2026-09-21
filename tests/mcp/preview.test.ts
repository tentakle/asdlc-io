import { afterAll, describe, expect, it } from "vitest";
import { verifyDeployment, mcpEndpoint } from "../../scripts/test-deploy-preview.mjs";
import { createKnowledgeBaseHandler } from "../../src/mcp/server.ts";
import { ContentService } from "../../src/mcp/content.ts";
import { verifyReferenceClient } from "../../scripts/test-mcp-client.mjs";
import { article } from "./modern-fixtures";
const preview = "https://deploy-preview-102--asdlc.netlify.app";
const endpoint = createKnowledgeBaseHandler(new ContentService([article]), {
  allowedOrigins: ["https://asdlc.io", preview],
});
afterAll(() => endpoint.close());
const fetchImpl: typeof fetch = async (input, init) => endpoint.fetch(new Request(input, init));
describe("deployed verification script", () => {
  it("connects with the actual reference SDK and executes tools", async () => {
    const result = await verifyReferenceClient(preview, { fetchImpl });
    expect(result.protocolVersion).toBe("2026-07-28");
    expect(result.articleSlug).toBe(article.slug);
  });
  it("exercises the entire contract against the real adapter", async () => {
    const result = await verifyDeployment(preview, { fetchImpl });
    expect(result.articleSlug).toBe(article.slug);
    expect(result.passed).toHaveLength(10);
  });
  it.each([
    "empty search",
    "wrong ID",
    "legacy discovery",
    "tool error",
  ])("fails rather than claiming compatibility on %s", async (defect) => {
    const broken: typeof fetch = async (input, init) => {
      const response = await fetchImpl(input, init);
      if (!response.headers.get("Content-Type")?.includes("application/json")) return response;
      const body = await response.json();
      const request = JSON.parse(String(init?.body));
      if (defect === "empty search" && request.params?.name === "search_knowledge_base")
        body.result.content = [{ type: "text", text: "No articles found." }];
      if (defect === "wrong ID") body.id = "wrong";
      if (defect === "legacy discovery" && request.method === "server/discover")
        body.result.supportedVersions = ["2025-11-25"];
      if (defect === "tool error" && request.params?.name === "get_article")
        body.result.isError = true;
      return Response.json(body, { status: response.status, headers: response.headers });
    };
    await expect(verifyDeployment(preview, { fetchImpl: broken })).rejects.toThrow();
  });
  it("normalizes endpoint URLs and rejects credential-bearing URLs", () => {
    expect(mcpEndpoint(`${preview}/mcp/`).href).toBe(`${preview}/mcp`);
    expect(() => mcpEndpoint("https://secret@example.com")).toThrow();
  });
});
