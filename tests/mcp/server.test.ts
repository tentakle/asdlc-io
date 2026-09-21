import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ContentService } from "../../src/mcp/content.ts";
import { createKnowledgeBaseHandler } from "../../src/mcp/server.ts";
import { handleToolCall, TOOLS } from "../../src/mcp/tools.ts";
import { article, message, request, VERSION } from "./modern-fixtures";

describe("modern stateless MCP", () => {
  const service = new ContentService([article]);
  let endpoint: ReturnType<typeof createKnowledgeBaseHandler>;
  beforeEach(() => {
    endpoint = createKnowledgeBaseHandler(service, { allowedOrigins: ["https://asdlc.io"] });
  });
  afterEach(async () => {
    await endpoint.close();
    vi.restoreAllMocks();
  });
  it("discovers only the modern tools capability and caches catalogs, never HTTP envelopes", async () => {
    for (const method of ["server/discover", "tools/list"]) {
      for (const id of [1, "second"]) {
        const response = await endpoint.fetch(request(message(method, {}, id)));
        expect(response.status).toBe(200);
        expect(response.headers.get("Cache-Control")).toBe("no-store");
        expect(response.headers.has("Mcp-Session-Id")).toBe(false);
        const body = await response.json();
        expect(body.id).toBe(id);
        expect(body.result).toMatchObject({
          resultType: "complete",
          ttlMs: 300000,
          cacheScope: "public",
          _meta: { "io.modelcontextprotocol/serverInfo": { name: "asdlc-knowledge-base" } },
        });
        if (method === "tools/list") expect(body.result.tools).toEqual(TOOLS);
        else {
          expect(body.result.supportedVersions).toEqual([VERSION]);
          expect(body.result.capabilities).toEqual({ tools: {} });
        }
      }
    }
  });
  it("searches and retrieves on independent instances with exact content-layer parity", async () => {
    for (const [name, args] of [
      ["list_articles", {}],
      ["search_knowledge_base", { query: "context" }],
      ["get_article", { slug: article.slug }],
    ] as const) {
      const fresh = createKnowledgeBaseHandler(service, { allowedOrigins: [] });
      try {
        const response = await fresh.fetch(
          request(message("tools/call", { name, arguments: args })),
        );
        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.result).toMatchObject(await handleToolCall(name, args, service));
        expect(body.result.resultType).toBe("complete");
        expect(body.result).not.toHaveProperty("ttlMs");
      } finally {
        await fresh.close();
      }
    }
  });
  it.each([
    "2024-11-05",
    "2025-03-26",
    "2025-06-18",
    "2025-11-25",
  ])("rejects %s before retrieval", async (version) => {
    const spy = vi.spyOn(service, "getArticleBySlug");
    const body = message();
    body.params._meta["io.modelcontextprotocol/protocolVersion"] = version;
    const response = await endpoint.fetch(request(body, { "MCP-Protocol-Version": version }));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatchObject({
      code: -32022,
      data: { supported: [VERSION] },
    });
    expect(spy).not.toHaveBeenCalled();
  });
  it.each([
    "MCP-Protocol-Version",
    "Mcp-Method",
    "Mcp-Name",
  ])("requires %s before dispatch", async (header) => {
    const spy = vi.spyOn(service, "getArticleBySlug");
    const req = request();
    req.headers.delete(header);
    const response = await endpoint.fetch(req);
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe(-32020);
    expect(spy).not.toHaveBeenCalled();
  });
  it.each([
    ["Mcp-Method", "tools/list"],
    ["Mcp-Name", "wrong"],
    ["Mcp-Name", "=?base64?%%%?="],
    ["MCP-Protocol-Version", "2025-11-25"],
  ])("rejects mismatched %s %s", async (header, value) => {
    const spy = vi.spyOn(service, "getArticleBySlug");
    const response = await endpoint.fetch(request(message(), { [header]: value }));
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe(-32020);
    expect(spy).not.toHaveBeenCalled();
  });
  it("accepts standard Base64 name encoding without clientInfo", async () => {
    const response = await endpoint.fetch(
      request(message(), {
        "Mcp-Name": `=?base64?${Buffer.from("get_article").toString("base64")}?=`,
      }),
    );
    expect(response.status).toBe(200);
  });
  it.each([null, 1.2, {}, [], true])("rejects invalid IDs without echoing them: %j", async (id) => {
    const spy = vi.spyOn(service, "getArticleBySlug");
    const response = await endpoint.fetch(
      request(message("tools/call", { name: "get_article" }, id)),
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      jsonrpc: "2.0",
      error: { code: -32600, message: expect.any(String) },
    });
    expect(spy).not.toHaveBeenCalled();
  });
  it.each([
    "missing capabilities",
    "invalid capabilities",
    "invalid identity",
    "missing metadata",
  ])("rejects %s", async (defect) => {
    const body = message();
    const params: Record<string, unknown> = body.params;
    if (defect === "missing metadata") delete params._meta;
    else {
      const meta = params._meta as Record<string, unknown>;
      if (defect === "missing capabilities")
        delete meta["io.modelcontextprotocol/clientCapabilities"];
      if (defect === "invalid capabilities")
        meta["io.modelcontextprotocol/clientCapabilities"] = "bad";
      if (defect === "invalid identity") meta["io.modelcontextprotocol/clientInfo"] = { name: 12 };
    }
    const spy = vi.spyOn(service, "getArticleBySlug");
    const response = await endpoint.fetch(request(body));
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe(-32602);
    expect(spy).not.toHaveBeenCalled();
  });
  it.each([
    "initialize",
    "unknown/method",
    "subscriptions/listen",
    "ping",
  ])("does not serve %s with modern metadata", async (method) => {
    const response = await endpoint.fetch(request(message(method, {})));
    expect(response.status).toBe(404);
    expect((await response.json()).error.code).toBe(-32601);
  });
  it.each([
    { name: "unknown" },
    {},
    { name: 123 },
    { name: "get_article", arguments: [] },
  ])("rejects malformed/unknown call %j", async (params) => {
    const spy = vi.spyOn(service, "getArticleBySlug");
    const response = await endpoint.fetch(request(message("tools/call", params)));
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe(-32602);
    expect(spy).not.toHaveBeenCalled();
  });
  it.each([
    { slug: 12 },
    {},
    { slug: "" },
    { slug: "unavailable" },
  ])("reports known tool errors as completed results %j", async (args) => {
    const response = await endpoint.fetch(
      request(message("tools/call", { name: "get_article", arguments: args })),
    );
    expect(response.status).toBe(200);
    expect((await response.json()).result).toMatchObject({
      resultType: "complete",
      isError: true,
      content: [{ type: "text", text: expect.any(String) }],
    });
  });
  it("hides unexpected error details", async () => {
    vi.spyOn(service, "getArticleBySlug").mockRejectedValue(new Error("secret database detail"));
    const response = await endpoint.fetch(request());
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error.code).toBe(-32603);
    expect(JSON.stringify(body)).not.toContain("secret");
  });
  it.each([
    "notifications/initialized",
    "tools/call",
  ])("discards ID-less %s without executing", async (method) => {
    const spy = vi.spyOn(service, "getArticleBySlug");
    const body = message(method);
    Reflect.deleteProperty(body, "id");
    const response = await endpoint.fetch(request(body));
    expect(response.status).toBe(202);
    expect(await response.text()).toBe("");
    expect(spy).not.toHaveBeenCalled();
  });
  it.each([
    [],
    { jsonrpc: "2.0", id: 1, result: {} },
    { jsonrpc: "2.0", method: 123 },
    { jsonrpc: "2.0", method: "tools/call", params: [] },
  ].map((body) => [body]))("rejects malformed envelope %j", async (body) => {
    const req = request();
    const response = await endpoint.fetch(new Request(req, { body: JSON.stringify(body) }));
    expect(response.status).toBe(400);
    const value = await response.json();
    expect(value.error.code).toBe(-32600);
    if (!("id" in body)) expect(value).not.toHaveProperty("id");
  });
  it("rejects legacy initialization and discards its notification", async () => {
    const response = await endpoint.fetch(
      new Request(request(), {
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: { protocolVersion: "2024-11-05" },
        }),
      }),
    );
    expect(response.status).toBe(400);
    expect(await response.text()).toContain(VERSION);
    const notification = await endpoint.fetch(
      new Request(request(), {
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
        },
        body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
      }),
    );
    expect(notification.status).toBe(202);
  });
  it.each([
    ["Content-Type", "text/plain", 415],
    ["Accept", "application/json", 406],
    ["Accept", "application/json, text/event-stream;q=0", 406],
  ])("rejects media %s %s", async (header, value, status) => {
    const spy = vi.spyOn(service, "getArticleBySlug");
    const response = await endpoint.fetch(request(message(), { [header]: String(value) }));
    expect(response.status).toBe(status);
    expect(spy).not.toHaveBeenCalled();
  });
  it("reports unparseable JSON", async () => {
    const response = await endpoint.fetch(new Request(request(), { body: "{" }));
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe(-32700);
  });
});
