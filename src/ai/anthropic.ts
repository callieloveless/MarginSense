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
import { AI_DEFAULTS, ANTHROPIC_API_KEY_ENV } from "./config";
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

/**
 * The real Anthropic-backed port. Constructed only when a key is present (see
 * {@link resolveModelPort}); its live calls are exercised only in the deferred key-gated stage.
 */
export function createAnthropicModelPort(): ModelPort {
  return {
    async complete(request: ModelRequest): Promise<ModelResponse> {
      // Lazy, import-guarded: the SDK never enters the module graph for mock-only callers.
      const { default: AnthropicClient } = await import("@anthropic-ai/sdk");
      const client = new AnthropicClient();

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

      // One call; loop only to resume a server-tool `pause_turn` (web search iteration cap).
      let response = await client.messages.create({
        model,
        max_tokens: request.maxTokens ?? AI_DEFAULTS.maxTokens,
        thinking: { type: "adaptive" },
        output_config: { effort: request.effort ?? AI_DEFAULTS.effort },
        ...(request.system ? { system: request.system } : {}),
        ...(tools.length > 0 ? { tools } : {}),
        messages,
      });
      let guard = 0;
      while (response.stop_reason === "pause_turn" && guard++ < 5) {
        messages.push({ role: "assistant", content: response.content });
        response = await client.messages.create({
          model,
          max_tokens: request.maxTokens ?? AI_DEFAULTS.maxTokens,
          thinking: { type: "adaptive" },
          output_config: { effort: request.effort ?? AI_DEFAULTS.effort },
          ...(request.system ? { system: request.system } : {}),
          ...(tools.length > 0 ? { tools } : {}),
          messages,
        });
      }

      // Extract text, the result-tool call, and citations from the final content.
      const outputBlocks: OutputBlock[] = [];
      const citations: Citation[] = [];
      let rawResult: unknown;
      for (const block of response.content) {
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
          rawResult = block.input;
        }
      }

      const result = request.resultSchema ? request.resultSchema.parse(rawResult) : undefined;
      if (request.resultSchema && rawResult === undefined) {
        throw new Error(
          `The model did not return a "${RESULT_TOOL_NAME}" structured result (stop_reason: ${response.stop_reason}).`,
        );
      }

      return {
        text: outputBlocks.map((b) => b.text).join(""),
        content: outputBlocks,
        usage: { inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens },
        ...(citations.length > 0 ? { citations } : {}),
        ...(request.resultSchema ? { result } : {}),
      };
    },
  };
}

/**
 * Resolve the model port from the environment. Returns `unconfigured` when
 * `ANTHROPIC_API_KEY` is unset (the real client is never constructed); otherwise a
 * `configured` port. `env` is injectable for tests.
 */
export function resolveModelPort(
  env: Record<string, string | undefined> = process.env,
): ModelPortResolution {
  const key = env[ANTHROPIC_API_KEY_ENV];
  if (!key) return { status: "unconfigured" };
  return { status: "configured", port: createAnthropicModelPort() };
}
