/**
 * The real model port and the configured/unconfigured resolver (constitution §7; techstack
 * §7). Mirrors the Supabase seam in `src/db/session.ts`: with no `ANTHROPIC_API_KEY`, the AI
 * layer reports `unconfigured` and the real client is never constructed, so the app renders a
 * "connect AI" state instead of crashing. The Anthropic key is server-side only.
 *
 * `createAnthropicModelPort` makes ONE `messages.create` call that can combine server-side web
 * search (`web_search_20260209`), citations, and a **strict result-tool** built from the
 * request's `resultSchema` — the model searches, then calls the result tool with typed data,
 * which we validate against `resultSchema`. This composes with citations, which
 * `output_config.format` does not (the API rejects that combination). The `@anthropic-ai/sdk`
 * is loaded **lazily** (dynamic import inside `complete`), so importing `src/ai` never pulls
 * the SDK into a bundle that only uses the mock.
 *
 * **Live model calls are deferred to live infra** (relevant_notes.md §5). The whole platform is
 * proven against the mock; this real path is validated end-to-end only once a key exists.
 */

import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import {
  AI_DEFAULTS,
  ANTHROPIC_API_KEY_ENV,
  ANTHROPIC_AUTH_TOKEN_ENV,
  CLAUDE_CODE_IDENTITY,
  CLAUDE_CODE_OAUTH_TOKEN_ENV,
  OAUTH_BETA,
} from "./config";
import {
  type Citation,
  type ModelPort,
  type ModelRequest,
  type ModelResponse,
  type OutputBlock,
} from "./port";

/** Whether the AI layer has a usable configuration this request. */
export type ModelPortResolution =
  | { readonly status: "configured"; readonly port: ModelPort }
  | { readonly status: "unconfigured" };

/**
 * How the real client authenticates: a pay-as-you-go **API key** (`x-api-key`) or a Claude
 * subscription **OAuth token** (`Authorization: Bearer` + the OAuth beta header + the Claude Code
 * identity system block). Resolved from the environment by {@link resolveModelPort}.
 */
export type AnthropicAuth =
  | { readonly mode: "apiKey"; readonly apiKey: string }
  | { readonly mode: "oauth"; readonly authToken: string };

/** The name of the strict tool the model calls to return the structured result. */
const RESULT_TOOL_NAME = "record_result";

/** Flatten a request message's text (image blocks are attached separately by the impl). */
function messageText(content: ModelRequest["messages"][number]["content"]): string {
  if (typeof content === "string") return content;
  return content
    .filter((b): b is Extract<typeof b, { type: "text" }> => b.type === "text")
    .map((b) => b.text)
    .join("\n");
}

/** The system field for the request: a plain string for API-key auth, or an array whose FIRST
 * block is the Claude Code identity for OAuth (subscription) tokens, which the API requires. */
function buildSystem(
  userSystem: string | undefined,
  auth: AnthropicAuth,
): string | Anthropic.Messages.TextBlockParam[] | undefined {
  if (auth.mode === "oauth") {
    const blocks: Anthropic.Messages.TextBlockParam[] = [{ type: "text", text: CLAUDE_CODE_IDENTITY }];
    if (userSystem) blocks.push({ type: "text", text: userSystem });
    return blocks;
  }
  return userSystem;
}

/** Compact, model-readable summary of why a result-tool input failed its schema — fed straight
 * back to the model in the one repair round (path + message + expected type per issue). */
function describeSchemaIssues(error: z.ZodError): string {
  return error.issues
    .slice(0, 8)
    .map((i) => {
      const path = i.path.map((p) => String(p)).join(".") || "(root)";
      const expected =
        "expected" in i && typeof (i as { expected?: unknown }).expected === "string"
          ? ` (expected ${(i as { expected: string }).expected})`
          : "";
      return `${path}: ${i.message}${expected}`;
    })
    .join("; ");
}

/** The sliver of the Anthropic SDK the port actually calls — enough to inject a scripted client in
 * a unit test (the structured-output repair round) without touching the real SDK or the network. */
export interface AnthropicLike {
  messages: {
    create(
      params: Anthropic.Messages.MessageCreateParamsNonStreaming,
    ): Promise<Anthropic.Messages.Message>;
  };
}

/**
 * The real Anthropic-backed port. Constructed only when auth is present (see
 * {@link resolveModelPort}); its live calls are exercised only in the deferred key-gated stage.
 * `clientOverride` is a test seam — production always builds the real, lazily-imported SDK client.
 */
export function createAnthropicModelPort(
  auth: AnthropicAuth,
  clientOverride?: AnthropicLike,
): ModelPort {
  return {
    async complete(request: ModelRequest): Promise<ModelResponse> {
      // Lazy, import-guarded: the SDK never enters the module graph for mock-only callers.
      const client: AnthropicLike =
        clientOverride ??
        (await (async () => {
          const { default: AnthropicClient } = await import("@anthropic-ai/sdk");
          // OAuth (subscription) tokens auth as a Bearer token with the OAuth beta header; an API
          // key uses the default x-api-key. `apiKey: null` stops the SDK picking a stray env key on
          // the OAuth path so the two auth headers can't collide.
          // Bound each call so a stuck request fails fast (→ the set is marked failed and the UI
          // recovers) instead of hanging on the SDK's 10-minute default; one retry, not the default
          // two, so an overloaded API can't stack minutes of backoff.
          const clientOptions = { timeout: 90_000, maxRetries: 1 };
          return auth.mode === "oauth"
            ? new AnthropicClient({
                apiKey: null,
                authToken: auth.authToken,
                defaultHeaders: { "anthropic-beta": OAUTH_BETA },
                ...clientOptions,
              })
            : new AnthropicClient({ apiKey: auth.apiKey, ...clientOptions });
        })());

      const model = request.model ?? AI_DEFAULTS.model;

      // Tools: any requested server tools (e.g. web_search_20260209) + a result tool built from
      // the Zod schema when the caller wants structured output.
      const tools: Anthropic.Messages.ToolUnion[] = [];
      for (const st of request.serverTools ?? []) {
        tools.push({ type: st.type, name: st.name } as unknown as Anthropic.Messages.ToolUnion);
      }
      if (request.resultSchema) {
        // Zod v4's native JSON-schema conversion (no external dep).
        const jsonSchema = z.toJSONSchema(request.resultSchema);
        tools.push({
          name: RESULT_TOOL_NAME,
          description:
            "Record the final structured result. Call this exactly once, at the end, with the complete result. Do not answer in prose.",
          input_schema: jsonSchema as Anthropic.Messages.Tool["input_schema"],
        });
      }

      // Assemble the user turns; attach any convenience images to the last user message.
      const messages: Anthropic.Messages.MessageParam[] = request.messages.map((m) => ({
        role: m.role,
        content: messageText(m.content),
      }));
      if (request.images && request.images.length > 0 && messages.length > 0) {
        const last = messages[messages.length - 1]!;
        const blocks: Anthropic.Messages.ContentBlockParam[] = [
          { type: "text", text: typeof last.content === "string" ? last.content : "" },
          ...request.images.map(
            (img): Anthropic.Messages.ContentBlockParam => ({
              type: "image",
              source: { type: "base64", media_type: img.mediaType as "image/png", data: img.dataBase64 },
            }),
          ),
        ];
        messages[messages.length - 1] = { role: last.role, content: blocks };
      }

      // Shared request params (identical across the initial call and every pause_turn resume) —
      // spread with the current `messages` so the two calls can never silently diverge.
      const system = buildSystem(request.system, auth);
      const baseParams = {
        model,
        max_tokens: request.maxTokens ?? AI_DEFAULTS.maxTokens,
        thinking: { type: "adaptive" } as const,
        output_config: { effort: request.effort ?? AI_DEFAULTS.effort },
        ...(system ? { system } : {}),
        ...(tools.length > 0 ? { tools } : {}),
      };

      // Every API call in this `complete()` (initial, pause-turn resumes, and a structured-output
      // repair) accumulates into one usage total, so the caller sees the whole cost of the turn.
      let inputTokens = 0;
      let outputTokens = 0;
      const create = async (
        params: Anthropic.Messages.MessageCreateParamsNonStreaming,
      ): Promise<Anthropic.Messages.Message> => {
        const r = await client.messages.create(params);
        inputTokens += r.usage.input_tokens;
        outputTokens += r.usage.output_tokens;
        return r;
      };

      // Snapshot the original turns before the pause loop mutates `messages` — the structured-output
      // repair resends these so it always ends on the user turn (a forced `tool_choice` after an
      // assistant pause turn would be rejected).
      const initialMessages = [...messages];

      // One call; loop only to resume a server-tool `pause_turn` (web search iteration cap).
      let response = await create({ ...baseParams, messages });
      let guard = 0;
      while (response.stop_reason === "pause_turn" && guard++ < 5) {
        messages.push({ role: "assistant", content: response.content });
        response = await create({ ...baseParams, messages });
      }

      // Pull text, EVERY result-tool call's input, and citations out of a response's content. All
      // inputs are collected (not just the last) because a model can emit the result tool more than
      // once — one of which may be the valid one.
      const collect = (content: Anthropic.Messages.ContentBlock[]) => {
        const outputBlocks: OutputBlock[] = [];
        const citations: Citation[] = [];
        const resultInputs: unknown[] = [];
        for (const block of content) {
          if (block.type === "text") {
            outputBlocks.push({ type: "text", text: block.text });
            for (const c of (block.citations ?? []) as unknown as ReadonlyArray<Record<string, unknown>>) {
              citations.push({
                url: typeof c.url === "string" ? c.url : undefined,
                title: typeof c.title === "string" ? c.title : undefined,
                citedText: typeof c.cited_text === "string" ? c.cited_text : undefined,
              });
            }
          } else if (block.type === "tool_use" && block.name === RESULT_TOOL_NAME) {
            resultInputs.push(block.input);
          }
        }
        return { outputBlocks, citations, resultInputs };
      };

      /** First result-tool input that satisfies the schema, else a model-readable failure reason. */
      const parseResult = (
        schema: NonNullable<ModelRequest["resultSchema"]>,
        inputs: readonly unknown[],
      ): { ok: true; data: unknown } | { ok: false; detail: string } => {
        if (inputs.length === 0) return { ok: false, detail: `you did not call the ${RESULT_TOOL_NAME} tool` };
        let lastError: z.ZodError | undefined;
        for (const input of inputs) {
          const p = schema.safeParse(input);
          if (p.success) return { ok: true, data: p.data };
          lastError = p.error;
        }
        return { ok: false, detail: lastError ? describeSchemaIssues(lastError) : "invalid result" };
      };

      let collected = collect(response.content);

      // Structured output: validate the result, and give the model exactly ONE chance to fix a
      // malformed call before we fail. Models occasionally return the wrong shape — a string where
      // the schema wants an array, a missing field — and throwing the whole run away over that is
      // wasteful. The repair is a FRESH resend of the original request with a sterner system note
      // (not a tool_result continuation): a continuation must answer every `tool_use` id the model
      // emitted or the API 400s, and a fresh resend sidesteps that entirely. The human-facing
      // prose/citations stay from the first response when the repair turn returns only the tool call.
      let result: unknown;
      if (request.resultSchema) {
        let outcome = parseResult(request.resultSchema, collected.resultInputs);
        if (!outcome.ok) {
          const strongerSystem = buildSystem(
            `${request.system ? `${request.system}\n\n` : ""}CRITICAL: Reply by calling ${RESULT_TOOL_NAME} exactly once, with input matching its JSON schema EXACTLY — every field must be the exact type shown (arrays must be JSON arrays, never strings) and every required field must be present. Your previous reply was rejected: ${outcome.detail}.`,
            auth,
          );
          // Force ONE clean result-tool call on the retry. Allowed only because we also turn OFF
          // adaptive thinking (the API forbids a forced `tool_choice` while thinking is on);
          // `disable_parallel_tool_use` stops the model emitting several calls again. `thinking` is
          // deleted rather than set undefined so the key is absent (exactOptionalPropertyTypes).
          const retryParams: Anthropic.Messages.MessageCreateParamsNonStreaming = {
            ...baseParams,
            ...(strongerSystem ? { system: strongerSystem } : {}),
            tool_choice: { type: "tool", name: RESULT_TOOL_NAME, disable_parallel_tool_use: true },
            messages: initialMessages,
          };
          delete retryParams.thinking;
          response = await create(retryParams);
          const repaired = collect(response.content);
          collected =
            repaired.outputBlocks.length > 0
              ? repaired
              : { ...repaired, outputBlocks: collected.outputBlocks, citations: collected.citations };
          outcome = parseResult(request.resultSchema, repaired.resultInputs);
          if (!outcome.ok) {
            throw new Error(
              `The model's ${RESULT_TOOL_NAME} result did not match the schema after one repair attempt: ${outcome.detail}`,
            );
          }
        }
        result = outcome.data;
      }

      return {
        text: collected.outputBlocks.map((b) => b.text).join(""),
        content: collected.outputBlocks,
        usage: { inputTokens, outputTokens },
        ...(collected.citations.length > 0 ? { citations: collected.citations } : {}),
        ...(request.resultSchema ? { result } : {}),
      };
    },
  };
}

/**
 * Resolve the model port from the environment. A Claude subscription **OAuth token**
 * (`ANTHROPIC_AUTH_TOKEN` / `CLAUDE_CODE_OAUTH_TOKEN`) takes precedence over a pay-as-you-go
 * **API key** (`ANTHROPIC_API_KEY`); with neither, the AI layer is `unconfigured` and the real
 * client is never constructed. `env` is injectable for tests.
 */
export function resolveModelPort(
  env: Record<string, string | undefined> = process.env,
): ModelPortResolution {
  const authToken = env[ANTHROPIC_AUTH_TOKEN_ENV] ?? env[CLAUDE_CODE_OAUTH_TOKEN_ENV];
  if (authToken) {
    return { status: "configured", port: createAnthropicModelPort({ mode: "oauth", authToken }) };
  }
  const key = env[ANTHROPIC_API_KEY_ENV];
  if (key) return { status: "configured", port: createAnthropicModelPort({ mode: "apiKey", apiKey: key }) };
  return { status: "unconfigured" };
}
