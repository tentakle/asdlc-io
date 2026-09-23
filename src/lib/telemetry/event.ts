import { z } from "astro/zod";

export type Operation = "search" | "retrieve" | "list";
export type Outcome = {
  operation: Operation;
  outcome: "success" | "zero_results" | "failure";
  failureCategory: "invalid_arguments" | "article_unavailable" | "execution_error" | null;
  resultCount: number | null;
  articleIds: string[];
};
export type Observation = Outcome & { query?: string };
export type Observer = (observation: Observation) => void;
export type Environment = "production" | "deploy-preview" | "branch-deploy";
export type Surface = "mcp" | "markdown_direct" | "markdown_negotiated";

const articleId = z
  .string()
  .regex(/^(concepts|patterns|practices|recipes)\/[a-z0-9]+(?:[-/][a-z0-9]+)*$/);
const propertiesSchema = z
  .object({
    asdlc_schema_version: z.literal(1),
    asdlc_event_id: z.string().uuid(),
    asdlc_environment: z.enum(["production", "deploy-preview", "branch-deploy"]),
    asdlc_surface: z.enum(["mcp", "markdown_direct", "markdown_negotiated"]),
    asdlc_operation: z.enum(["search", "retrieve", "list"]),
    asdlc_outcome: z.enum(["success", "zero_results", "failure"]),
    asdlc_failure_category: z
      .enum(["invalid_arguments", "article_unavailable", "execution_error"])
      .nullable(),
    asdlc_result_count: z.number().int().nonnegative().nullable(),
    asdlc_article_ids: z.array(articleId),
    asdlc_query_state: z.enum([
      "captured",
      "not_applicable",
      "invalid_arguments",
      "redaction_failed",
    ]),
    asdlc_query_redacted: z.boolean().nullable(),
    asdlc_query_truncated: z.boolean().nullable(),
    $process_person_profile: z.literal(false),
    $geoip_disable: z.literal(true),
    $ai_trace_id: z.string().uuid().optional(),
    $ai_span_id: z.string().uuid().optional(),
    $ai_span_name: z.enum(["search", "retrieve", "list"]).optional(),
    $ai_session_id: z.null().optional(),
    $ai_input_state: z
      .object({
        query: z
          .string()
          .refine((s) => [...s].length <= 256)
          .optional(),
      })
      .strict()
      .optional(),
    $ai_output_state: z
      .object({
        result_count: z.number().int().nonnegative().nullable(),
        article_ids: z.array(articleId),
        outcome: z.enum(["success", "zero_results", "failure"]),
        failure_category: z
          .enum(["invalid_arguments", "article_unavailable", "execution_error"])
          .nullable(),
      })
      .strict()
      .optional(),
  })
  .strict();

export const eventSchema = z
  .object({
    event: z.enum(["$ai_span", "article_retrieved"]),
    uuid: z.string().uuid(),
    distinct_id: z.string().uuid(),
    timestamp: z.string().datetime(),
    properties: propertiesSchema,
  })
  .strict()
  .superRefine((event, ctx) => {
    const p = event.properties;
    const invalid = (message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, message });
    if (event.uuid !== p.asdlc_event_id || event.distinct_id !== event.uuid)
      invalid("Event identity mismatch");
    if (new Set(p.asdlc_article_ids).size !== p.asdlc_article_ids.length)
      invalid("Duplicate article IDs");
    if (p.asdlc_outcome === "failure") {
      if (!p.asdlc_failure_category || p.asdlc_result_count !== null || p.asdlc_article_ids.length)
        invalid("Invalid failure outcome");
      if (p.asdlc_failure_category === "article_unavailable" && p.asdlc_operation !== "retrieve")
        invalid("Invalid unavailable outcome");
    } else {
      if (p.asdlc_failure_category !== null || p.asdlc_result_count === null)
        invalid("Invalid completed outcome");
      if (p.asdlc_operation === "search") {
        if (p.asdlc_result_count !== p.asdlc_article_ids.length) invalid("Search count mismatch");
        if ((p.asdlc_outcome === "zero_results") !== (p.asdlc_result_count === 0))
          invalid("Invalid zero-result outcome");
      } else if (p.asdlc_outcome !== "success") invalid("Only search can have zero results");
      if (
        p.asdlc_operation === "retrieve" &&
        (p.asdlc_result_count !== 1 || p.asdlc_article_ids.length !== 1)
      )
        invalid("Invalid retrieval count");
      if (p.asdlc_operation === "list" && p.asdlc_article_ids.length)
        invalid("Listing IDs excluded");
    }
    const queryState = p.asdlc_query_state;
    if (p.asdlc_operation !== "search" && queryState !== "not_applicable")
      invalid("Query on non-search");
    if (p.asdlc_operation === "search" && queryState === "not_applicable")
      invalid("Missing search query state");
    if (
      p.asdlc_operation === "search" &&
      (queryState === "invalid_arguments") !== (p.asdlc_failure_category === "invalid_arguments")
    )
      invalid("Invalid argument query state");
    if (queryState === "captured") {
      if (
        p.$ai_input_state?.query === undefined ||
        p.asdlc_query_redacted === null ||
        p.asdlc_query_truncated === null
      )
        invalid("Missing captured query");
    } else if (
      p.$ai_input_state?.query !== undefined ||
      p.asdlc_query_redacted !== null ||
      p.asdlc_query_truncated !== null
    )
      invalid("Unexpected query data");
    if (p.asdlc_surface === "mcp") {
      if (
        event.event !== "$ai_span" ||
        !p.$ai_trace_id ||
        p.$ai_span_id !== event.uuid ||
        p.$ai_span_name !== p.asdlc_operation ||
        p.$ai_session_id !== null ||
        !p.$ai_input_state ||
        !p.$ai_output_state
      )
        invalid("Incomplete span");
      const output = p.$ai_output_state;
      if (
        output &&
        (output.outcome !== p.asdlc_outcome ||
          output.failure_category !== p.asdlc_failure_category ||
          output.result_count !== p.asdlc_result_count ||
          JSON.stringify(output.article_ids) !== JSON.stringify(p.asdlc_article_ids))
      )
        invalid("Output state mismatch");
    } else {
      if (
        event.event !== "article_retrieved" ||
        p.asdlc_operation !== "retrieve" ||
        p.asdlc_outcome !== "success" ||
        p.asdlc_article_ids.some((id) => id.startsWith("recipes/"))
      )
        invalid("Invalid Markdown event");
      if (Object.keys(p).some((key) => key.startsWith("$ai_")))
        invalid("AI state on Markdown event");
    }
  });
export type TelemetryEvent = z.infer<typeof eventSchema>;

export function failure(
  operation: Operation,
  category: NonNullable<Outcome["failureCategory"]>,
): Outcome {
  return {
    operation,
    outcome: "failure",
    failureCategory: category,
    resultCount: null,
    articleIds: [],
  };
}

export function buildEvent(
  observation: Observation,
  environment: Environment,
  surface: Surface,
  sanitize: (query: string) => { text: string; redacted: boolean; truncated: boolean },
): TelemetryEvent {
  const id = crypto.randomUUID();
  let input: { query?: string } = {};
  let queryState: TelemetryEvent["properties"]["asdlc_query_state"] = "not_applicable";
  let redacted: boolean | null = null;
  let truncated: boolean | null = null;
  if (observation.operation === "search") {
    queryState = "invalid_arguments";
    if (observation.failureCategory !== "invalid_arguments") {
      try {
        if (typeof observation.query !== "string") throw new Error("Missing query");
        const result = sanitize(observation.query);
        input = { query: result.text };
        redacted = result.redacted;
        truncated = result.truncated;
        queryState = "captured";
      } catch {
        queryState = "redaction_failed";
      }
    }
  }
  return eventSchema.parse({
    event: surface === "mcp" ? "$ai_span" : "article_retrieved",
    uuid: id,
    distinct_id: id,
    timestamp: new Date().toISOString(),
    properties: {
      asdlc_schema_version: 1,
      asdlc_event_id: id,
      asdlc_environment: environment,
      asdlc_surface: surface,
      asdlc_operation: observation.operation,
      asdlc_outcome: observation.outcome,
      asdlc_failure_category: observation.failureCategory,
      asdlc_result_count: observation.resultCount,
      asdlc_article_ids: observation.articleIds,
      asdlc_query_state: queryState,
      asdlc_query_redacted: redacted,
      asdlc_query_truncated: truncated,
      $process_person_profile: false,
      $geoip_disable: true,
      ...(surface === "mcp"
        ? {
            $ai_trace_id: crypto.randomUUID(),
            $ai_span_id: id,
            $ai_span_name: observation.operation,
            $ai_session_id: null,
            $ai_input_state: input,
            $ai_output_state: {
              result_count: observation.resultCount,
              article_ids: observation.articleIds,
              outcome: observation.outcome,
              failure_category: observation.failureCategory,
            },
          }
        : {}),
    },
  });
}
