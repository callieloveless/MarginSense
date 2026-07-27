/**
 * Structured-output repair (offline). The real Photo Advisor run failed twice: first because Claude
 * returned a result-tool call whose shape didn't match the schema (`labor` a string, `findings`
 * missing) and the port threw the whole run away; then, when the first fix tried to continue the
 * conversation, because the model had emitted TWO result-tool calls and a `tool_result`
 * continuation must answer every `tool_use` id or the API 400s. The port now (a) accepts any valid
 * call when several are present and (b) repairs with a FRESH resend + sterner system note, never a
 * `tool_result` turn. These tests script a fake Anthropic client (no network, no key) to prove all
 * of that, plus usage accounting across the extra call.
 */

import { describe, expect, it } from "vitest";
import { z } from "zod";
import type Anthropic from "@anthropic-ai/sdk";
import { createAnthropicModelPort, type AnthropicLike } from "./anthropic";

const schema = z.object({
  findings: z.array(z.object({ summary: z.string() })),
  labor: z.array(z.object({ description: z.string(), laborMinutes: z.number().int().positive() })),
});

/** A minimal fake `messages.create` that returns a scripted response per call and records params. */
function scriptedClient(responses: Anthropic.Messages.Message[]) {
  const calls: Anthropic.Messages.MessageCreateParamsNonStreaming[] = [];
  const client: AnthropicLike = {
    messages: {
      create: async (params) => {
        const r = responses[calls.length];
        calls.push(params);
        if (!r) throw new Error(`no scripted response for call ${calls.length}`);
        return r;
      },
    },
  };
  return { client, calls };
}

function message(
  content: unknown[],
  usage: { input_tokens: number; output_tokens: number } = { input_tokens: 10, output_tokens: 5 },
): Anthropic.Messages.Message {
  return {
    id: "m",
    type: "message",
    role: "assistant",
    model: "claude-opus-4-8",
    content,
    stop_reason: "tool_use",
    stop_sequence: null,
    usage,
  } as unknown as Anthropic.Messages.Message;
}

const toolUse = (id: string, input: unknown) => ({ type: "tool_use", id, name: "record_result", input });
const text = (t: string) => ({ type: "text", text: t });

const port = (client: AnthropicLike) => createAnthropicModelPort({ mode: "apiKey", apiKey: "sk-test" }, client);

/** True if any message we sent, in any call, carried a tool_result block (what 400'd live). */
const sentAnyToolResult = (calls: Anthropic.Messages.MessageCreateParamsNonStreaming[]) =>
  calls
    .flatMap((c) => c.messages)
    .some(
      (m) =>
        Array.isArray(m.content) &&
        m.content.some((b) => (b as { type?: string }).type === "tool_result"),
    );

describe("structured-output repair round", () => {
  it("repairs a malformed result with a fresh, strengthened resend (no tool_result) and sums usage", async () => {
    const { client, calls } = scriptedClient([
      // Turn 1: prose + a result-tool call with the exact shape the live failure had.
      message([text("Looked at it."), toolUse("t1", { labor: "two hours" })], { input_tokens: 10, output_tokens: 5 }),
      // Turn 2 (repair): only the corrected tool call, no prose.
      message(
        [toolUse("t2", { findings: [{ summary: "cracked joist" }], labor: [{ description: "sister the joist", laborMinutes: 120 }] })],
        { input_tokens: 8, output_tokens: 4 },
      ),
    ]);

    const res = await port(client).complete({
      messages: [{ role: "user", content: "assess" }],
      resultSchema: schema,
    });

    expect(res.result).toEqual({
      findings: [{ summary: "cracked joist" }],
      labor: [{ description: "sister the joist", laborMinutes: 120 }],
    });
    expect(calls).toHaveLength(2);
    // Usage is the sum across the initial call and the repair call.
    expect(res.usage).toEqual({ inputTokens: 18, outputTokens: 9 });
    // Prose from turn 1 survives even though the repair turn returned only the tool call.
    expect(res.text).toContain("Looked at it");

    // The repair is a fresh resend of the SAME messages with a sterner system — not a continuation.
    expect(calls[1]!.messages).toHaveLength(calls[0]!.messages.length);
    expect(typeof calls[1]!.system).toBe("string");
    expect(calls[1]!.system as string).toMatch(/record_result/);
    expect(calls[1]!.system as string).toMatch(/rejected/i);
    // We never send a tool_result — that is what the real API rejected.
    expect(sentAnyToolResult(calls)).toBe(false);

    // First call: adaptive thinking, no forced tool. Retry: forced single result-tool call, thinking
    // off (the two must go together — the API forbids forcing a tool while thinking is on).
    expect(calls[0]!.thinking).toEqual({ type: "adaptive" });
    expect(calls[0]!.tool_choice).toBeUndefined();
    expect(calls[1]!.thinking).toBeUndefined();
    expect(calls[1]!.tool_choice).toEqual({ type: "tool", name: "record_result", disable_parallel_tool_use: true });
  });

  it("accepts a valid call when the model emits several result-tool calls (no repair)", async () => {
    const { client, calls } = scriptedClient([
      message([
        toolUse("t1", { labor: "bad" }),
        toolUse("t2", { findings: [], labor: [{ description: "ok", laborMinutes: 30 }] }),
      ]),
    ]);

    const res = await port(client).complete({
      messages: [{ role: "user", content: "x" }],
      resultSchema: schema,
    });

    expect(res.result).toEqual({ findings: [], labor: [{ description: "ok", laborMinutes: 30 }] });
    expect(calls).toHaveLength(1); // one call already validated — nothing to repair
  });

  it("repairs several all-invalid tool calls without ever sending a tool_result (the live 400)", async () => {
    const { client, calls } = scriptedClient([
      message([toolUse("t1", { labor: "bad" }), toolUse("t2", { findings: "nope" })]),
      message([toolUse("t3", { findings: [], labor: [] })]),
    ]);

    const res = await port(client).complete({
      messages: [{ role: "user", content: "x" }],
      resultSchema: schema,
    });

    expect(res.result).toEqual({ findings: [], labor: [] });
    expect(calls).toHaveLength(2);
    expect(sentAnyToolResult(calls)).toBe(false);
  });

  it("does not retry when the first structured result is valid", async () => {
    const { client, calls } = scriptedClient([message([toolUse("t1", { findings: [], labor: [] })])]);

    const res = await port(client).complete({
      messages: [{ role: "user", content: "x" }],
      resultSchema: schema,
    });

    expect(res.result).toEqual({ findings: [], labor: [] });
    expect(calls).toHaveLength(1);
  });

  it("throws a clear error when the result is still invalid after the repair round", async () => {
    const { client } = scriptedClient([
      message([toolUse("t1", { labor: "nope" })]),
      message([toolUse("t2", { labor: "still nope" })]),
    ]);

    await expect(
      port(client).complete({ messages: [{ role: "user", content: "x" }], resultSchema: schema }),
    ).rejects.toThrow(/after one repair/i);
  });

  it("re-asks for the tool when the model answered in prose, then succeeds", async () => {
    const { client, calls } = scriptedClient([
      message([text("It looks fine.")], { input_tokens: 6, output_tokens: 3 }),
      message([toolUse("t2", { findings: [], labor: [] })]),
    ]);

    const res = await port(client).complete({
      messages: [{ role: "user", content: "x" }],
      resultSchema: schema,
    });

    expect(res.result).toEqual({ findings: [], labor: [] });
    // The strengthened system note names the tool and the reason (no call was made).
    expect(calls[1]!.system as string).toMatch(/record_result/);
    expect(sentAnyToolResult(calls)).toBe(false);
  });

  it("passes prose through untouched when no result schema is requested", async () => {
    const { client, calls } = scriptedClient([message([text("just prose, no tool")])]);

    const res = await port(client).complete({ messages: [{ role: "user", content: "x" }] });

    expect(res.result).toBeUndefined();
    expect(res.text).toBe("just prose, no tool");
    expect(calls).toHaveLength(1); // no schema → no repair round
  });
});
