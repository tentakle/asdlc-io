import articles from "../../mcp/articles.json" with { type: "json" };
import { createObserver, type TelemetryContext } from "./capture.ts";

const published = new Set(
  articles
    .filter(
      (article) =>
        (article.status === "Live" || article.status === "Experimental") &&
        article.collection !== "recipes",
    )
    .map((article) => `${article.collection}/${article.slug}`),
);

/** Uses the build's published corpus, never raw caller-controlled slugs as event properties. */
export function observeMarkdown(
  request: Request,
  response: Response,
  context: TelemetryContext | undefined,
  surface: "markdown_direct" | "markdown_negotiated",
  articleId: string,
) {
  try {
    if (
      request.method !== "GET" ||
      response.status !== 200 ||
      response.headers.get("Content-Type")?.split(";")[0].trim().toLowerCase() !==
        "text/markdown" ||
      !published.has(articleId)
    )
      return;
    createObserver(
      context,
      surface,
    )({
      operation: "retrieve",
      outcome: "success",
      failureCategory: null,
      resultCount: 1,
      articleIds: [articleId],
    });
  } catch {
    /* Collection must never change response or negotiation fallback. */
  }
}
