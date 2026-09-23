import { afterEach, describe, expect, it, vi } from "vitest";
import directHandler, { config } from "../../netlify/edge-functions/markdown-telemetry.ts";
import negotiatedHandler from "../../netlify/edge-functions/markdown-negotiation.ts";
import mcpHandler from "../../netlify/edge-functions/mcp.ts";
import { request as mcpRequest } from "../mcp/modern-fixtures.ts";

const base = "https://preview.example";
const article = "concepts/context-engineering";
function setup() {
  const pending: Promise<unknown>[] = [];
  const send = vi.fn<typeof fetch>().mockResolvedValue(new Response("1"));
  vi.stubGlobal("fetch", send);
  vi.stubGlobal("Netlify", { env: { get: (key: string) => ({ TELEMETRY_MODE: "preview", POSTHOG_CAPTURE_HOST: "https://eu.i.posthog.com", POSTHOG_PROJECT_TOKEN: "test-token" })[key] } });
  const context = { deploy: { context: "deploy-preview" }, waitUntil: (task: Promise<unknown>) => { pending.push(task); } };
  return { pending, send, context };
}
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers(); });
describe("edge telemetry integration", () => {
  it("returns the same direct response including caching headers, despite a forged suppression header", async () => {
    const { pending, send, context } = setup();
    const response = new Response("markdown", { headers: { "Content-Type": "text/markdown; charset=utf-8", "Cache-Control": "public, max-age=60", ETag: "fixture" } });
    const next = vi.fn().mockResolvedValue(response);
    const result = await directHandler(new Request(`${base}/${article}.md`, { headers: { "X-Telemetry-Internal": "1" } }), { ...context, next });
    expect(result).toBe(response);
    expect(next).toHaveBeenCalledExactlyOnceWith({ sendConditionalRequest: true });
    expect(config).not.toHaveProperty("cache");
    await Promise.all(pending);
    expect(send).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(send.mock.calls[0][1]?.body))).toMatchObject({ event: "article_retrieved", properties: { asdlc_surface: "markdown_direct", asdlc_article_ids: [article] } });
  });
  it("observes negotiated Markdown after its existing-chain rewrite, once per external call", async () => {
    const { pending, send, context } = setup();
    const next = vi.fn().mockImplementation(async () => new Response("markdown", { headers: { "Content-Type": "text/markdown" } }));
    const response = await negotiatedHandler(new Request(`${base}/${article}/`, { headers: { Accept: "text/markdown" } }), { ...context, next });
    expect(next).toHaveBeenCalledTimes(1);
    expect((next.mock.calls[0][0] as Request).url).toBe(`${base}/${article}.md`);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("markdown");
    expect(response.headers.get("X-Markdown-Tokens")).toBe("2");
    await Promise.all(pending);
    expect(send).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(send.mock.calls[0][1]?.body)).properties.asdlc_surface).toBe("markdown_negotiated");
  });
  it.each([
    ["HEAD", article, 200, "text/markdown"], ["GET", article, 304, "text/markdown"],
    ["GET", article, 404, "text/markdown"], ["GET", article, 200, "text/html"],
    ["GET", "concepts/not-a-published-article", 200, "text/markdown"], ["GET", "recipes/critic", 200, "text/markdown"],
  ])("does not record %s %s %s %s", async (method, slug, status, type) => {
    const { pending, send, context } = setup();
    const response = new Response(null, { status, headers: { "Content-Type": type } });
    expect(await directHandler(new Request(`${base}/${slug}.md`, { method }), { ...context, next: async () => response })).toBe(response);
    await Promise.all(pending);
    expect(send).not.toHaveBeenCalled();
  });
  it("preserves HTML fallback when negotiated asset does not exist", async () => {
    const { pending, send, context } = setup();
    const html = new Response("html", { headers: { "Content-Type": "text/html" } });
    const next = vi.fn().mockResolvedValueOnce(new Response(null, { status: 404 })).mockResolvedValueOnce(html);
    expect(await negotiatedHandler(new Request(`${base}/${article}/`, { headers: { Accept: "text/markdown" } }), { ...context, next })).toBe(html);
    await Promise.all(pending);
    expect(send).not.toHaveBeenCalled();
  });
  it("delivers MCP response while telemetry is still stalled", async () => {
    vi.useFakeTimers();
    const { pending, send, context } = setup();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    send.mockImplementation((_url, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new Error("timeout")), { once: true });
    }));
    const response = await mcpHandler(mcpRequest(), { ...context, site: { url: base } });
    expect(response.status).toBe(200);
    expect((await response.json()).result.content[0].text).toContain("Context Engineering");
    expect(pending).toHaveLength(1);
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    await vi.advanceTimersByTimeAsync(5_000);
    await Promise.all(pending);
    expect(send).toHaveBeenCalledTimes(1);
  });
});
