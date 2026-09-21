#!/usr/bin/env node
/** Actual SDK client exercise; no handwritten requests or compatibility fallback. */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { mcpEndpoint, PROTOCOL_VERSION } from "./test-deploy-preview.mjs";

export async function verifyReferenceClient(baseUrl, { fetchImpl = fetch } = {}) {
  const endpoint = mcpEndpoint(baseUrl);
  const exchanges = [];
  const transport = new StreamableHTTPClientTransport(endpoint, {
    fetch: async (input, init) => {
      const req = new Request(input, init);
      const body = req.method === "POST" ? await req.clone().json() : undefined;
      const response = await fetchImpl(req);
      exchanges.push({
        method: body?.method ?? req.method,
        tool: body?.params?.name,
        protocolVersion: req.headers.get("MCP-Protocol-Version"),
        bodyVersion: body?.params?._meta?.["io.modelcontextprotocol/protocolVersion"],
        status: response.status,
      });
      return response;
    },
  });
  const client = new Client(
    { name: "asdlc-preview-verifier", version: "1.0.0" },
    { capabilities: {}, versionNegotiation: { mode: { pin: PROTOCOL_VERSION } } },
  );
  function text(result) {
    assert.notEqual(result.isError, true);
    const value = result.content
      ?.filter((item) => item.type === "text")
      .map((item) => item.text)
      .join("\n");
    assert(value?.trim());
    return value;
  }
  try {
    await client.connect(transport, { timeout: 15000 });
    assert.equal(client.getNegotiatedProtocolVersion(), PROTOCOL_VERSION);
    const discovery = await client.discover({ timeout: 15000 });
    assert.deepEqual(discovery.supportedVersions, [PROTOCOL_VERSION]);
    const tools = await client.listTools({}, { timeout: 15000 });
    assert.deepEqual(
      tools.tools.map((tool) => tool.name),
      ["list_articles", "get_article", "search_knowledge_base"],
    );
    const listing = await client.callTool({ name: "list_articles", arguments: {} }, undefined, {
      timeout: 15000,
    });
    assert.match(text(listing), /- \[[^\]]+\]/);
    const search = await client.callTool(
      { name: "search_knowledge_base", arguments: { query: "context engineering" } },
      undefined,
      { timeout: 15000 },
    );
    const slug = text(search).match(/^- \[([^\]]+)\]/m)?.[1];
    assert(slug, "Search returned no article slug");
    const article = await client.callTool({ name: "get_article", arguments: { slug } }, undefined, {
      timeout: 15000,
    });
    const articleText = text(article);
    assert.match(articleText, /^# /);
    assert(
      exchanges.every(
        (exchange) =>
          exchange.protocolVersion === PROTOCOL_VERSION &&
          exchange.bodyVersion === PROTOCOL_VERSION &&
          exchange.status === 200,
      ),
    );
    const installed = JSON.parse(
      await readFile(
        new URL("../node_modules/@modelcontextprotocol/client/package.json", import.meta.url),
        "utf8",
      ),
    );
    return {
      endpoint: endpoint.href,
      client: `@modelcontextprotocol/client@${installed.version}`,
      mode: "pinned modern-only",
      protocolVersion: client.getNegotiatedProtocolVersion(),
      server: client.getServerVersion(),
      articleSlug: slug,
      articleCharacters: articleText.length,
      exchanges,
    };
  } finally {
    await client.close();
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!process.argv[2]) {
    console.error("Usage: pnpm test:mcp-client <preview-url> [deployed-commit]");
    process.exitCode = 1;
  } else
    try {
      console.log(
        JSON.stringify(
          {
            ...(await verifyReferenceClient(process.argv[2])),
            testedAt: new Date().toISOString(),
            deployedCommit: process.argv[3] ?? "not supplied",
          },
          null,
          2,
        ),
      );
    } catch (error) {
      console.error(`MCP SDK client verification failed: ${error.message}`);
      process.exitCode = 1;
    }
}
