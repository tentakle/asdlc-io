/** Modern-only, anonymous MCP endpoint. Deployment origins never come from request headers. */
import Fuse from "fuse.js";
import { ContentService, type Article } from "../../src/mcp/content.ts";
import { createKnowledgeBaseHandler } from "../../src/mcp/server.ts";
import articles from "../../src/mcp/articles.json" with { type: "json" };
import fuseIndexData from "../../src/mcp/fuse-index.json" with { type: "json" };

interface EdgeContext {
  deploy: { context: string };
  site: { url?: string };
}

let service: ContentService;
function getService() {
  if (!service) {
    const index = Fuse.parseIndex<Article>(
      fuseIndexData as unknown as Parameters<typeof Fuse.parseIndex>[0],
    );
    service = new ContentService(articles as Article[], index);
  }
  return service;
}

export default async function handler(request: Request, context?: EdgeContext): Promise<Response> {
  const allowedOrigins = ["https://asdlc.io"];
  // The explicit preview origin is injected via Netlify environment configuration.
  const runtime = globalThis as typeof globalThis & {
    Netlify?: { env: { get(name: string): string | undefined } };
  };
  if (context?.deploy.context === "deploy-preview") {
    const previewOrigin = runtime.Netlify?.env.get("MCP_PREVIEW_ORIGIN");
    if (previewOrigin?.startsWith("https://")) allowedOrigins.push(previewOrigin);
  }
  if (context?.deploy.context === "dev") {
    const localOrigin = runtime.Netlify?.env.get("MCP_LOCAL_ORIGIN");
    if (localOrigin) allowedOrigins.push(localOrigin);
  }
  const endpoint = createKnowledgeBaseHandler(getService(), { allowedOrigins });
  try {
    return await endpoint.fetch(request);
  } finally {
    await endpoint.close();
  }
}

export const config = { path: "/mcp" };
