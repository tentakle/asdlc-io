import type { TelemetryContext } from "../../src/lib/telemetry/capture.ts";
import { observeMarkdown } from "../../src/lib/telemetry/markdown.ts";
interface Context extends TelemetryContext {
  next: (options?: { sendConditionalRequest: boolean }) => Promise<Response>;
}
/** Runs for external .md requests; context.next rewrites retain their original chain. */
export default async function handler(request: Request, context: Context): Promise<Response> {
  const response = await context.next({ sendConditionalRequest: true });
  const path = new URL(request.url).pathname;
  const match = /^\/(concepts|patterns|practices)\/([a-z0-9-]+)\.md$/.exec(path);
  if (match) observeMarkdown(request, response, context, "markdown_direct", `${match[1]}/${match[2]}`);
  return response;
}
export const config = { path: ["/concepts/*.md", "/patterns/*.md", "/practices/*.md"] };
