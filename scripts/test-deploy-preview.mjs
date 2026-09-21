#!/usr/bin/env node
/** Verify the modern MCP wire contract against a local server or deployed preview. */
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";

export const PROTOCOL_VERSION = "2026-07-28";
const VERSION_KEY = "io.modelcontextprotocol/protocolVersion";
const CAPABILITIES_KEY = "io.modelcontextprotocol/clientCapabilities";
const INFO_KEY = "io.modelcontextprotocol/serverInfo";
const TOOL_NAMES = ["list_articles", "get_article", "search_knowledge_base"];

export function mcpEndpoint(baseUrl) {
  const url = new URL(baseUrl);
  assert(["https:", "http:"].includes(url.protocol), "Expected an HTTP(S) URL");
  assert(
    !url.username && !url.password && !url.search && !url.hash,
    "Use a URL without credentials, query or fragment",
  );
  url.pathname = `${url.pathname.replace(/\/$/, "").replace(/\/mcp$/, "")}/mcp`;
  return url;
}

export async function verifyDeployment(baseUrl, { fetchImpl = fetch, timeoutMs = 15000 } = {}) {
  const endpoint = mcpEndpoint(baseUrl);
  const passed = [];
  let nextId = 0;
  const send = (options) =>
    fetchImpl(endpoint, { ...options, redirect: "error", signal: AbortSignal.timeout(timeoutMs) });
  async function rpc(
    method,
    params = {},
    { version = PROTOCOL_VERSION, headers = {}, expectedStatus = 200, expectedError } = {},
  ) {
    const id = ++nextId;
    const response = await send({
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        "MCP-Protocol-Version": version,
        "Mcp-Method": method,
        ...(typeof params.name === "string" && { "Mcp-Name": params.name }),
        ...headers,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id,
        method,
        params: { ...params, _meta: { [VERSION_KEY]: version, [CAPABILITIES_KEY]: {} } },
      }),
    });
    assert.equal(response.status, expectedStatus, `${method}: HTTP status`);
    assert.match(
      response.headers.get("Content-Type") ?? "",
      /^application\/json\b/i,
      `${method}: JSON response`,
    );
    assert.equal(response.headers.get("Cache-Control"), "no-store", `${method}: HTTP cache policy`);
    assert.equal(response.headers.has("Mcp-Session-Id"), false, `${method}: no session`);
    const body = await response.json();
    assert.equal(body.jsonrpc, "2.0");
    assert.equal(body.id, id, `${method}: correlation ID`);
    if (expectedError !== undefined) {
      assert.equal(body.error?.code, expectedError, `${method}: error code`);
      assert.equal(body.result, undefined);
      return { body, response };
    }
    assert.equal(body.error, undefined, `${method}: unexpected protocol error`);
    assert.equal(body.result?.resultType, "complete", `${method}: completed result`);
    assert.equal(body.result._meta?.[INFO_KEY]?.name, "asdlc-knowledge-base");
    assert.equal(typeof body.result._meta[INFO_KEY].version, "string");
    return { body, response };
  }
  function toolText(result) {
    assert.notEqual(result.isError, true, "Tool execution failed");
    assert.equal(result.ttlMs, undefined, "Tool calls must not carry catalog cache hints");
    const text = result.content
      ?.filter((item) => item.type === "text")
      .map((item) => item.text)
      .join("\n");
    assert(text?.trim(), "Expected nonempty text content");
    return text;
  }
  function catalog(result) {
    assert.equal(result.ttlMs, 300000);
    assert.equal(result.cacheScope, "public");
  }

  // Direct calls precede discovery: a handshake cannot be required.
  const direct = await rpc("tools/list");
  assert.deepEqual(
    direct.body.result.tools.map((tool) => tool.name),
    TOOL_NAMES,
  );
  catalog(direct.body.result);
  passed.push("direct tools/list without discovery");
  const discovery = await rpc("server/discover");
  assert.deepEqual(discovery.body.result.supportedVersions, [PROTOCOL_VERSION]);
  assert.deepEqual(discovery.body.result.capabilities, { tools: {} });
  catalog(discovery.body.result);
  passed.push("discovery, identity, modern-only capabilities, catalog cache hints");
  const listing = await rpc("tools/call", { name: "list_articles", arguments: {} });
  assert.match(toolText(listing.body.result), /- \[[^\]]+\]/);
  passed.push("list_articles");
  const search = await rpc("tools/call", {
    name: "search_knowledge_base",
    arguments: { query: "context engineering" },
  });
  const slug = toolText(search.body.result).match(/^- \[([^\]]+)\]/m)?.[1];
  assert(slug, "Search must return an article slug, not a no-results message");
  passed.push("search_knowledge_base");
  const article = await rpc("tools/call", { name: "get_article", arguments: { slug } });
  const articleText = toolText(article.body.result);
  assert.match(articleText, /^# /);
  passed.push("get_article using a returned search slug");

  for (const version of ["2024-11-05", "2025-03-26", "2025-06-18", "2025-11-25"]) {
    const rejected = await rpc(
      "tools/call",
      { name: "list_articles", arguments: {} },
      { version, expectedStatus: 400, expectedError: -32022 },
    );
    assert.deepEqual(rejected.body.error.data.supported, [PROTOCOL_VERSION]);
  }
  passed.push("all published 2024/2025 revisions rejected");
  const legacy = await send({
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "legacy",
      method: "initialize",
      params: { protocolVersion: "2024-11-05" },
    }),
  });
  assert.equal(legacy.status, 400);
  const legacyBody = await legacy.json();
  assert([-32020, -32022].includes(legacyBody.error?.code));
  assert(JSON.stringify(legacyBody).includes(PROTOCOL_VERSION));
  await rpc("initialize", {}, { expectedStatus: 404, expectedError: -32601 });
  await rpc(
    "tools/call",
    { name: "get_article", arguments: { slug } },
    { headers: { "Mcp-Name": "wrong" }, expectedStatus: 400, expectedError: -32020 },
  );
  passed.push("legacy initialization and mismatched headers rejected");
  for (const method of ["GET", "DELETE"]) {
    const response = await send({ method });
    assert.equal(response.status, 405);
    assert.equal(response.headers.get("Allow"), "POST, OPTIONS");
    await response.body?.cancel();
  }
  passed.push("no legacy GET/SSE or session deletion");
  const notification = await send({
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
  });
  assert.equal(notification.status, 202);
  assert.equal(await notification.text(), "");
  passed.push("notification disposal");

  for (const origin of new Set(["https://asdlc.io", endpoint.origin])) {
    const response = await send({
      method: "OPTIONS",
      headers: {
        Origin: origin,
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers":
          "content-type, accept, mcp-protocol-version, mcp-method, mcp-name",
      },
    });
    assert.equal(response.status, 204, `Preflight for ${origin}`);
    assert.equal(response.headers.get("Access-Control-Allow-Origin"), origin);
    assert.match(response.headers.get("Vary") ?? "", /\bOrigin\b/i);
    assert.equal(response.headers.has("Access-Control-Allow-Credentials"), false);
    const cors = await rpc("tools/list", {}, { headers: { Origin: origin } });
    assert.equal(cors.response.headers.get("Access-Control-Allow-Origin"), origin);
  }
  for (const origin of ["null", "https://unrelated-preview.example"]) {
    const response = await send({ method: "POST", headers: { Origin: origin }, body: "broken" });
    assert.equal(response.status, 403);
    assert.equal(response.headers.has("Access-Control-Allow-Origin"), false);
    await response.body?.cancel();
  }
  passed.push("exact production/preview browser grants and rejected origins");
  return {
    endpoint: endpoint.href,
    protocolVersion: PROTOCOL_VERSION,
    server: discovery.body.result._meta[INFO_KEY],
    articleSlug: slug,
    articleCharacters: articleText.length,
    passed,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const target = process.argv[2];
  if (!target) {
    console.error("Usage: pnpm test:mcp-preview <preview-url> [deployed-commit]");
    process.exitCode = 1;
  } else {
    try {
      const result = await verifyDeployment(target);
      console.log(
        JSON.stringify(
          {
            ...result,
            testedAt: new Date().toISOString(),
            deployedCommit: process.argv[3] ?? "not supplied",
            verifier: "wire-contract script; not actual-client certification",
          },
          null,
          2,
        ),
      );
    } catch (error) {
      console.error(`MCP preview verification failed: ${error.message}`);
      process.exitCode = 1;
    }
  }
}
