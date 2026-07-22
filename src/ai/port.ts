/**
 * The model port (constitution §5; techstack §4) — the single interface tools call to reach
 * Claude. Tools depend on THIS interface, never on `@anthropic-ai/sdk`, so the whole platform
 * unit-tests against a mock and the real client stays behind one seam.
 *
 * The request shape is deliberately sized for the tools that come next: a system prompt, a
 * message list, optional **image** input (Photo Advisor's vision, #8), and optional
 * **server-tool** declarations (Material Finder's web search, #7). The response reports
 * content, **token usage** (for `tool_run` cost logging), and optional **citations** (#7).
 * The mock ignores images/server-tools — those tools add *behaviour*, not a new interface.
 */

import { type Effort } from "./config";

/** A block a tool sends in. Text or an image (base64, e.g. a job photo for vision). */
export type InputBlock =
  | { readonly type: "text"; readonly text: string }
  | { readonly type: "image"; readonly mediaType: string; readonly dataBase64: string };

/** A conversation turn handed to the model. */
export interface ModelMessage {
  readonly role: "user" | "assistant";
  readonly content: string | readonly InputBlock[];
}

/** A server-side tool a tool wants Claude to use (e.g. web search). Declared here; the tool
 * change that needs it (#7) wires the real behaviour behind the port. */
export interface ServerToolSpec {
  readonly type: string;
  readonly name: string;
}

/** One request to the model. `model`/`effort` default from {@link AI_DEFAULTS} when omitted. */
export interface ModelRequest {
  readonly system?: string | undefined;
  readonly messages: readonly ModelMessage[];
  /** Convenience image inputs; the real impl appends them to the last user turn. */
  readonly images?: readonly Extract<InputBlock, { type: "image" }>[] | undefined;
  readonly serverTools?: readonly ServerToolSpec[] | undefined;
  readonly model?: string | undefined;
  readonly effort?: Effort | undefined;
  readonly maxTokens?: number | undefined;
}

/** Token usage for one call — summed into a `tool_run` for cost observability (§7). */
export interface Usage {
  readonly inputTokens: number;
  readonly outputTokens: number;
}

/** A source citation (Material Finder returns these with prices, #7). */
export interface Citation {
  readonly url?: string | undefined;
  readonly title?: string | undefined;
  readonly citedText?: string | undefined;
}

/** A block the model returns. */
export type OutputBlock = { readonly type: "text"; readonly text: string };

/** The model's response: flattened `text` for convenience, plus blocks, usage, citations. */
export interface ModelResponse {
  readonly text: string;
  readonly content: readonly OutputBlock[];
  readonly usage: Usage;
  readonly citations?: readonly Citation[] | undefined;
}

/** The seam every tool calls. Implementations: the mock (`mock.ts`) and the real Anthropic
 * client behind `ANTHROPIC_API_KEY` (`anthropic.ts`). */
export interface ModelPort {
  complete(request: ModelRequest): Promise<ModelResponse>;
}

/** A port that tallies token usage across every call made through it, for one tool run. */
export interface MeteredModelPort {
  readonly port: ModelPort;
  /** Total tokens across all calls so far (partial spend still counts on a failed run). */
  usage(): Usage;
}

/**
 * Wrap a base port so the runner can read a run's total token spend after `run(ctx)` — the
 * tool calls `metered.port` freely, and the runner records `metered.usage()` into the
 * `tool_run`, even when the run later fails.
 */
export function meterModelPort(base: ModelPort): MeteredModelPort {
  let inputTokens = 0;
  let outputTokens = 0;
  const port: ModelPort = {
    async complete(request) {
      const response = await base.complete(request);
      inputTokens += response.usage.inputTokens;
      outputTokens += response.usage.outputTokens;
      return response;
    },
  };
  return { port, usage: () => ({ inputTokens, outputTokens }) };
}
