/** Browser policy is separate from MCP wire validation and tool execution. */
export const MCP_REQUEST_HEADERS = [
  "Content-Type",
  "Accept",
  "MCP-Protocol-Version",
  "Mcp-Method",
  "Mcp-Name",
] as const;

export interface McpHttpPolicy {
  allowedOrigins: readonly string[];
}

export function isAllowedOrigin(origin: string, policy: McpHttpPolicy): boolean {
  try {
    const url = new URL(origin);
    return (
      (url.protocol === "https:" || url.protocol === "http:") &&
      url.origin === origin &&
      policy.allowedOrigins.includes(origin)
    );
  } catch {
    return false;
  }
}

/** Always preserve the transport's status/body while applying browser grants. */
export function withHttpPolicy(
  response: Response,
  origin: string | null,
  policy: McpHttpPolicy,
): Response {
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "no-store");
  headers.set("Vary", "Origin");
  if (origin !== null && isAllowedOrigin(origin, policy)) {
    headers.set("Access-Control-Allow-Origin", origin);
  }
  return new Response(response.body, { status: response.status, headers });
}

/** Return a terminal response when a request cannot proceed to the protocol. */
export function checkHttpPolicy(request: Request, policy: McpHttpPolicy): Response | undefined {
  const origin = request.headers.get("Origin");
  if (origin !== null && !isAllowedOrigin(origin, policy)) {
    return new Response("Origin not allowed", { status: 403 });
  }

  if (request.method === "OPTIONS") {
    const method = request.headers.get("Access-Control-Request-Method");
    const requestedHeaders = request.headers.get("Access-Control-Request-Headers");
    const allowedHeaders = new Set(MCP_REQUEST_HEADERS.map((header) => header.toLowerCase()));
    if (
      (method !== null && method !== "POST") ||
      (origin !== null && method === null) ||
      requestedHeaders
        ?.split(",")
        .some((header) => !allowedHeaders.has(header.trim().toLowerCase()))
    ) {
      return new Response("Preflight not allowed", { status: 403 });
    }
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": MCP_REQUEST_HEADERS.join(", "),
      },
    });
  }

  if (request.method !== "POST") {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: { Allow: "POST, OPTIONS" },
    });
  }
}
