/**
 * Structured-output repair (offline). The real Photo Advisor run failed because Claude returned a
 * result-tool call whose shape didn't match the schema (`labor` a string, `findings` missing), and
 * the port threw the whole analysis away. The port now gives the model ONE corrective round; these
 * tests script a fake Anthropic client (no network, no key) to prove the recovery, the usage
 * accounting across the extra call, and the failure boundary.
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
const lastMessage = (params: Anthropic.Messages.MessageCreateParamsNonStreaming) =>
  params.messages[params.messages.length - 1]!;

const port = (client: AnthropicLike) => createAnthropicModelPort({ mode: "apiKey", apiKey: "sk-test" }, client);

describe("structured-output repair round", () => {
  it("repairs a malformed result in one round, sums usage, and keeps the first turn's prose", async () => {
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

    // The correction was an errored tool_result referencing the first tool_use id.
    const correction = lastMessage(calls[1]!);
    const block = (correction.content as unknown as Array<Record<string, unknown>>)[0]!;
    expect(block.type).toBe("tool_result");
    expect(block.tool_use_id).toBe("t1");
    expect(block.is_error).toBe(true);
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

  it("re-asks for the tool (plain nudge) when the model answered in prose, then succeeds", async () => {
    const { client, calls } = scriptedClient([
      message([text("It looks fine.")], { input_tokens: 6, output_tokens: 3 }),
      message([toolUse("t2", { findings: [], labor: [] })]),
    ]);

    const res = await port(client).complete({
      messages: [{ role: "user", content: "x" }],
      resultSchema: schema,
    });

    expect(res.result).toEqual({ findings: [], labor: [] });
    // With no tool_use to reference, the correction is a plain string user turn asking for the tool.
    const correction = lastMessage(calls[1]!);
    expect(typeof correction.content).toBe("string");
    expect(correction.content as string).toMatch(/record_result/);
  });

  it("passes a valid non-array result straight through with no result schema unaffected", async () => {
    const { client, calls } = scriptedClient([message([text("just prose, no tool")])]);

    const res = await port(client).complete({ messages: [{ role: "user", content: "x" }] });

    expect(res.result).toBeUndefined();
    expect(res.text).toBe("just prose, no tool");
    expect(calls).toHaveLength(1); // no schema → no repair round
  });
});
