/**
 * The mock model port (techstack §5) — deterministic, offline, the default in every unit
 * test. It makes no network call and needs no key, so the whole tool platform is proven
 * without touching a real model (live calls are deferred, `anthropic.ts`). Determinism is
 * required: no `Date.now`, no randomness — the same request always yields the same reply and
 * the same token counts.
 */

import { type Citation, type ModelPort, type ModelRequest, type ModelResponse, type Usage } from "./port";

/** Options to steer the mock in a specific test (e.g. a canned reply or fixed usage). */
export interface MockModelOptions {
  /** Produce the reply text for a request. Defaults to a deterministic summary. */
  readonly reply?: (request: ModelRequest) => string;
  /** Override the reported usage. Defaults to a deterministic char-based estimate. */
  readonly usage?: Usage;
  /** A canned structured result. When the request carries a `resultSchema`, it is validated
   * through that schema (so a test fails loudly if the canned shape drifts). May be a function of
   * the request, so one mock can serve a chain of runs whose schemas differ (e.g. a Photo Advisor
   * run that composes a Code Finder run — each wants a different result shape). */
  readonly result?: unknown | ((request: ModelRequest) => unknown);
  /** Canned citations to return (as a web-search call would). */
  readonly citations?: readonly Citation[];
}

/** Flatten a request's message text (ignoring images) for the default reply/estimate. */
function requestText(request: ModelRequest): string {
  const parts: string[] = [];
  if (request.system) parts.push(request.system);
  for (const message of request.messages) {
    if (typeof message.content === "string") {
      parts.push(message.content);
    } else {
      for (const block of message.content) {
        if (block.type === "text") parts.push(block.text);
      }
    }
  }
  return parts.join("\n");
}

/** A deterministic ~token estimate (≈4 chars/token), floored at 1 for any non-empty text. */
function estimateTokens(text: string): number {
  return text.length === 0 ? 0 : Math.max(1, Math.ceil(text.length / 4));
}

/**
 * Create a mock {@link ModelPort}. The default reply echoes the last user text as a one-line
 * "summary", which is enough for the reference tool to prove the wire; pass `reply` to script
 * a specific response.
 */
export function createMockModelPort(options: MockModelOptions = {}): ModelPort {
  return {
    async complete(request) {
      const text = options.reply
        ? options.reply(request)
        : `Mock summary: ${requestText(request).slice(0, 200)}`;
      const usage: Usage = options.usage ?? {
        inputTokens: estimateTokens(requestText(request)),
        outputTokens: estimateTokens(text),
      };
      // `result` is present only when a `resultSchema` was requested (matching the contract);
      // the canned value is validated through the schema so a drifted shape fails loudly. When
      // `result` is a function, it is resolved against this request first (so one mock can serve a
      // chain of runs with different schemas).
      const rawResult =
        typeof options.result === "function"
          ? (options.result as (r: ModelRequest) => unknown)(request)
          : options.result;
      const result = request.resultSchema ? request.resultSchema.parse(rawResult) : undefined;
      const response: ModelResponse = {
        text,
        content: [{ type: "text", text }],
        usage,
        result,
        citations: options.citations,
      };
      return response;
    },
  };
}
