import { afterEach, describe, expect, it, vi } from "vitest";
import handler, { config } from "../../netlify/edge-functions/mcp.ts";
import { ContentService } from "../../src/mcp/content.ts";
import { createKnowledgeBaseHandler } from "../../src/mcp/server.ts";
import { article, message, request } from "./modern-fixtures";

const preview = "https://deploy-preview-50--asdlc.netlify.app";
afterEach(() => vi.unstubAllGlobals());
describe("MCP Edge browser boundary", () => {
  it("routes the real generated content at /mcp", async () => {
    expect(config.path).toBe("/mcp");
    const response = await handler(request(message("tools/list", {})));
    expect(response.status).toBe(200);
    expect((await response.json()).result.tools).toHaveLength(3);
  });
  it.each([
    "GET",
    "DELETE",
    "PUT",
    "PATCH",
    "HEAD",
  ])("returns 405 for %s without an SSE stream", async (method) => {
    const response = await handler(new Request("https://asdlc.io/mcp", { method }));
    expect(response.status).toBe(405);
    expect(response.headers.get("Allow")).toBe("POST, OPTIONS");
    expect(response.headers.get("Content-Type")).not.toContain("event-stream");
  });
  it.each([
    "null",
    "https://evil.example",
    "https://asdlc.io/",
    "https://asdlc.io.evil.example",
    "not an origin",
    "http://localhost:4321",
  ])("rejects Origin %s even on malformed requests", async (origin) => {
    const response = await handler(
      new Request("https://asdlc.io/mcp", {
        method: "POST",
        headers: { Origin: origin },
        body: "broken",
      }),
    );
    expect(response.status).toBe(403);
    expect(response.headers.has("Access-Control-Allow-Origin")).toBe(false);
  });
  it("grants the exact production origin on both success and protocol errors", async () => {
    for (const body of [message("tools/list", {}), message("unknown", {})]) {
      const response = await handler(request(body, { Origin: "https://asdlc.io" }));
      expect(response.headers.get("Access-Control-Allow-Origin")).toBe("https://asdlc.io");
      expect(response.headers.get("Vary")).toContain("Origin");
      expect(response.headers.has("Access-Control-Allow-Credentials")).toBe(false);
    }
  });
  it("accepts required preflight headers case-insensitively", async () => {
    const response = await handler(
      new Request("https://asdlc.io/mcp", {
        method: "OPTIONS",
        headers: {
          Origin: "https://asdlc.io",
          "Access-Control-Request-Method": "POST",
          "Access-Control-Request-Headers":
            "content-type, ACCEPT, mcp-protocol-version, Mcp-Method, mcp-name",
        },
      }),
    );
    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
    expect(response.headers.get("Access-Control-Allow-Methods")).toBe("POST, OPTIONS");
    expect(response.headers.get("Access-Control-Allow-Headers")?.toLowerCase()).toContain(
      "mcp-name",
    );
  });
  it.each<Record<string, string>>([
    { "Access-Control-Request-Method": "GET" },
    { "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "authorization" },
    {},
  ])("rejects unsupported preflight %j", async (headers) => {
    const response = await handler(
      new Request("https://asdlc.io/mcp", {
        method: "OPTIONS",
        headers: { Origin: "https://asdlc.io", ...headers },
      }),
    );
    expect(response.status).toBe(403);
    expect(response.headers.has("Access-Control-Allow-Methods")).toBe(false);
  });
  it("isolates explicit preview and local origins from production", async () => {
    vi.stubGlobal("Netlify", {
      env: {
        get: (key: string) => (key === "MCP_PREVIEW_ORIGIN" ? preview : "http://localhost:4321"),
      },
    });
    for (const [context, origin, status] of [
      ["deploy-preview", preview, 200],
      ["deploy-preview", "https://deploy-preview-51--asdlc.netlify.app", 403],
      ["production", preview, 403],
      ["production", "http://localhost:4321", 403],
      ["dev", "http://localhost:4321", 200],
    ] as const) {
      const response = await handler(request(message("tools/list", {}), { Origin: origin }), {
        deploy: { context },
        site: {},
      });
      expect(response.status).toBe(status);
    }
  });
  it("never trusts the request URL to permit a preview origin", async () => {
    const req = request(message("tools/list", {}), { Origin: preview });
    const response = await handler(new Request(`${preview}/mcp`, req), {
      deploy: { context: "deploy-preview" },
      site: {},
    });
    expect(response.status).toBe(403);
  });
  it("rejects origins before executing a tool", async () => {
    const service = new ContentService([article]);
    const spy = vi.spyOn(service, "getArticleBySlug");
    const endpoint = createKnowledgeBaseHandler(service, { allowedOrigins: [] });
    try {
      expect(
        (await endpoint.fetch(request(message(), { Origin: "https://evil.example" }))).status,
      ).toBe(403);
      expect(spy).not.toHaveBeenCalled();
    } finally {
      await endpoint.close();
    }
  });
  it("does not list, search, or retrieve unpublished documents", async () => {
    const service = new ContentService([
      article,
      ...(["Draft", "Proposed", "Deprecated"] as const).map((status) => ({
        ...article,
        status,
        slug: status,
      })),
    ]);
    expect((await service.listArticles()).map((a) => a.slug)).toEqual([article.slug]);
    expect((await service.searchArticles("context")).map((a) => a.slug)).toEqual([article.slug]);
    const endpoint = createKnowledgeBaseHandler(service, { allowedOrigins: [] });
    try {
      for (const slug of ["Draft", "Proposed", "Deprecated"]) {
        const response = await endpoint.fetch(
          request(message("tools/call", { name: "get_article", arguments: { slug } })),
        );
        expect((await response.json()).result.isError).toBe(true);
      }
    } finally {
      await endpoint.close();
    }
  });
});
