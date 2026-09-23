import { afterEach, describe, expect, it, vi } from "vitest";
import { captureConfig, createObserver } from "../../src/lib/telemetry/capture.ts";
import { buildEvent, eventSchema, failure, type Observation } from "../../src/lib/telemetry/event.ts";
import { redactQuery } from "../../src/lib/telemetry/redact.ts";

const search: Observation = { operation: "search", outcome: "zero_results", failureCategory: null,
  resultCount: 0, articleIds: [], query: "context engineering" };
const settings: Record<string, string> = { TELEMETRY_MODE: "preview", POSTHOG_CAPTURE_HOST: "https://eu.i.posthog.com", POSTHOG_PROJECT_TOKEN: "test-project-token" };
const env = (key: string) => settings[key];
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe("private event contract", () => {
  it("keeps search text exclusively in expiring input while duplicating query-free output", () => {
    const event = buildEvent({ ...search, query: "email user@example.com token=secretvalue" }, "deploy-preview", "mcp", redactQuery);
    expect(event.properties.$ai_input_state?.query).toBe("email [redacted] [redacted]");
    const { $ai_input_state: _input, $ai_output_state: output, ...durable } = event.properties;
    expect(JSON.stringify(durable)).not.toMatch(/user@example|secretvalue|email \[redacted\]/);
    expect(output).toEqual({ result_count: 0, article_ids: [], outcome: "zero_results", failure_category: null });
    expect(durable.asdlc_result_count).toBe(0);
    expect(durable.$process_person_profile).toBe(false);
  });
  it("drops query on redaction failure, with valid empty input state", () => {
    const event = buildEvent(search, "production", "mcp", () => { throw new Error("private input"); });
    expect(event.properties.$ai_input_state).toEqual({});
    expect(event.properties.asdlc_query_state).toBe("redaction_failed");
    expect(event.properties.asdlc_result_count).toBe(0);
    expect(JSON.stringify(event)).not.toContain(search.query);
  });
  it("validates failures distinctly from successful empty results", () => {
    const event = buildEvent({ ...failure("search", "execution_error"), query: "context" }, "production", "mcp", redactQuery);
    expect(event.properties.asdlc_result_count).toBeNull();
    expect(eventSchema.safeParse({ ...event, properties: { ...event.properties, asdlc_result_count: 0 } }).success).toBe(false);
    expect(eventSchema.safeParse({ ...event, properties: { ...event.properties, query: "leaked" } }).success).toBe(false);
    expect(eventSchema.safeParse({ ...event, properties: { ...event.properties, $ai_output_state: undefined } }).success).toBe(false);
  });
  it("records invalid search arguments without retaining their value", () => {
    const event = buildEvent(failure("search", "invalid_arguments"), "production", "mcp", redactQuery);
    expect(event.properties.asdlc_query_state).toBe("invalid_arguments");
    expect(event.properties.$ai_input_state).toEqual({});
  });
});

describe("bounded redaction", () => {
  it.each(["user@example.com", "192.168.0.1", "2001:db8::1", "::1", "+358 40 123 4567", "https://example.com/private?q=secret", "Bearer abcdefghijkl", "api_key=very-secret", "ghp_123456789abcdefgh", "eyJhbGci.eyJhIjox.signature"])("redacts %s", (value) => {
    expect(redactQuery(`find ${value} please`).text).not.toContain(value);
    expect(redactQuery(value).redacted).toBe(true);
  });
  it.each(["ADR 0002", "ISO 27001", "version 2026.09.23", "v1.2.3", "@netlify/blobs 11.1.0"])("preserves technical query %s", (value) => {
    expect(redactQuery(value)).toEqual({ text: value, redacted: false, truncated: false });
  });
  it("redacts before truncation and counts Unicode code points", () => {
    expect(redactQuery(`${"x".repeat(250)} user@example.com`).text).not.toContain("user@");
    expect([...redactQuery("😀".repeat(300)).text]).toHaveLength(256);
    expect(redactQuery("😀".repeat(300)).truncated).toBe(true);
    expect(() => redactQuery("x".repeat(16_385))).toThrow();
  });
});

describe("capture boundary", () => {
  it.each([
    ["production", "production", true], ["preview", "deploy-preview", true], ["preview", "branch-deploy", true],
    ["production", "branch-deploy", false], ["preview", "production", false], ["off", "production", false],
    ["preview", "dev", false], ["preview", "unknown", false],
  ])("mode %s in %s enables %s", (mode, context, enabled) => {
    expect(!!captureConfig(context, (key) => key === "TELEMETRY_MODE" ? mode : env(key))).toBe(enabled);
  });
  it("rejects an arbitrary capture host and missing credentials", () => {
    expect(captureConfig("branch-deploy", (key) => key === "POSTHOG_CAPTURE_HOST" ? "https://evil.test" : env(key))).toBeNull();
    expect(captureConfig("branch-deploy", (key) => key === "POSTHOG_PROJECT_TOKEN" ? "" : env(key))).toBeNull();
  });
  it("sends one allowlisted POST, with no caller headers and no retry on 500", async () => {
    const send = vi.fn<typeof fetch>().mockResolvedValue(new Response("private service message", { status: 500 }));
    const diagnose = vi.fn();
    const pending: Promise<unknown>[] = [];
    const observer = createObserver({ deploy: { context: "branch-deploy" }, waitUntil: (task) => { pending.push(task); } }, "mcp", { env, fetch: send, diagnose });
    expect(observer(search)).toBeUndefined();
    await Promise.all(pending);
    expect(send).toHaveBeenCalledTimes(1);
    const [url, init] = send.mock.calls[0];
    expect(url).toBe("https://eu.i.posthog.com/i/v0/e/");
    expect(init?.redirect).toBe("error");
    expect(init?.headers).toEqual({ "Content-Type": "application/json" });
    expect(JSON.parse(String(init?.body))).toMatchObject({ api_key: "test-project-token", event: "$ai_span", properties: { asdlc_environment: "branch-deploy" } });
    expect(diagnose).toHaveBeenCalledExactlyOnceWith("capture_failed");
  });
  it("aborts a stalled request at five seconds without retrying", async () => {
    vi.useFakeTimers();
    const send = vi.fn<typeof fetch>().mockImplementation((_url, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new Error("private network detail")), { once: true });
    }));
    const pending: Promise<unknown>[] = [];
    const diagnose = vi.fn();
    createObserver({ deploy: { context: "deploy-preview" }, waitUntil: (task) => { pending.push(task); } }, "mcp", { env, fetch: send, diagnose })(search);
    await vi.advanceTimersByTimeAsync(5_000);
    await Promise.all(pending);
    expect(send).toHaveBeenCalledTimes(1);
    expect(diagnose).toHaveBeenCalledExactlyOnceWith("capture_timeout");
  });
  it("does not send anything without a runtime lifetime or when disabled", () => {
    const send = vi.fn<typeof fetch>();
    createObserver({ deploy: { context: "deploy-preview" } }, "mcp", { env, fetch: send })(search);
    createObserver({ deploy: { context: "production" }, waitUntil: vi.fn() }, "mcp", { env, fetch: send })(search);
    expect(send).not.toHaveBeenCalled();
  });
});
