import {
  buildEvent,
  type Environment,
  type Observation,
  type Observer,
  type Surface,
} from "./event.ts";
import { redactQuery } from "./redact.ts";

export interface TelemetryContext {
  deploy?: { context: string };
  waitUntil?: (promise: Promise<unknown>) => void;
}
export type Diagnostic =
  | "capture_failed"
  | "capture_timeout"
  | "invalid_event"
  | "scheduling_failed";
export type CaptureConfig = { host: string; token: string; environment: Environment };
export function captureConfig(
  context: string | undefined,
  env: (key: string) => string | undefined,
): CaptureConfig | null {
  const mode = env("TELEMETRY_MODE");
  const allowed =
    (mode === "production" && context === "production") ||
    (mode === "preview" && (context === "deploy-preview" || context === "branch-deploy"));
  const token = env("POSTHOG_PROJECT_TOKEN");
  const host = env("POSTHOG_CAPTURE_HOST");
  if (!allowed || !token?.trim() || host !== "https://eu.i.posthog.com") return null;
  return { host, token, environment: context as Environment };
}

/** Observer is synchronous and inert when disabled; every async failure is contained. */
export function createObserver(
  context: TelemetryContext | undefined,
  surface: Surface,
  options: {
    env?: (key: string) => string | undefined;
    fetch?: typeof fetch;
    diagnose?: (category: Diagnostic) => void;
  } = {},
): Observer {
  const diagnose = (category: Diagnostic) => {
    try {
      (options.diagnose ?? ((value) => console.warn(`telemetry:${value}`)))(category);
    } catch {
      /* Diagnostics cannot affect delivery. */
    }
  };
  try {
    const runtime = globalThis as typeof globalThis & {
      Netlify?: { env: { get(name: string): string | undefined } };
    };
    const env = options.env ?? ((key) => runtime.Netlify?.env.get(key));
    const config = captureConfig(context?.deploy?.context, env);
    if (!config || !context?.waitUntil) return () => {};
    const send = options.fetch ?? fetch;
    return (observation: Observation) => {
      // Build an allowlisted event before scheduling; raw input never enters background work.
      let event: ReturnType<typeof buildEvent>;
      try {
        event = buildEvent(observation, config.environment, surface, redactQuery);
      } catch {
        diagnose("invalid_event");
        return;
      }
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5_000);
      const task = Promise.resolve().then(async () => {
        try {
          const response = await send(`${config.host}/i/v0/e/`, {
            method: "POST",
            redirect: "error",
            signal: controller.signal,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ api_key: config.token, ...event }),
          });
          if (!response.ok) diagnose("capture_failed");
          await response.body?.cancel();
        } catch {
          diagnose(controller.signal.aborted ? "capture_timeout" : "capture_failed");
        } finally {
          clearTimeout(timer);
        }
      });
      try {
        context.waitUntil?.(task);
      } catch {
        controller.abort();
        clearTimeout(timer);
        diagnose("scheduling_failed");
      }
    };
  } catch {
    return () => {};
  }
}
