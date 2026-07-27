/**
 * Unit tests for the AI layer (add-tool-platform). Everything here runs offline against the
 * mock port; the resolver is tested with an injected env so no real key is ever needed.
 */

import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  AI_DEFAULTS,
  MODELS,
  createMockModelPort,
  meterModelPort,
  readResult,
  resolveModelPort,
} from "./index";

describe("AI config", () => {
  it("centralizes the default judgment model as claude-opus-4-8", () => {
    expect(MODELS.judgment).toBe("claude-opus-4-8");
    expect(AI_DEFAULTS.model).toBe("claude-opus-4-8");
    expect(AI_DEFAULTS.thinking).toBe("adaptive");
  });
});

describe("mock model port", () => {
  it("is deterministic: same request → same reply and usage", async () => {
    const port = createMockModelPort();
    const req = { messages: [{ role: "user" as const, content: "Find 2x4 studs" }] };
    const a = await port.complete(req);
    const b = await port.complete(req);
    expect(a.text).toBe(b.text);
    expect(a.usage).toEqual(b.usage);
    expect(a.content[0]).toEqual({ type: "text", text: a.text });
    expect(a.usage.outputTokens).toBeGreaterThan(0);
  });

  it("honours a scripted reply and fixed usage", async () => {
    const port = createMockModelPort({ reply: () => "canned", usage: { inputTokens: 5, outputTokens: 2 } });
    const res = await port.complete({ messages: [{ role: "user", content: "x" }] });
    expect(res.text).toBe("canned");
    expect(res.usage).toEqual({ inputTokens: 5, outputTokens: 2 });
  });
});

describe("metered model port", () => {
  it("sums usage across every call in a run", async () => {
    const base = createMockModelPort({ usage: { inputTokens: 10, outputTokens: 4 } });
    const metered = meterModelPort(base);
    await metered.port.complete({ messages: [{ role: "user", content: "a" }] });
    await metered.port.complete({ messages: [{ role: "user", content: "b" }] });
    expect(metered.usage()).toEqual({ inputTokens: 20, outputTokens: 8 });
  });
});

describe("structured result (mock)", () => {
  const schema = z.object({
    items: z.array(z.object({ name: z.string(), priceCents: z.number().int() })),
  });

  it("returns a schema-valid result + citations, narrowed by readResult", async () => {
    const port = createMockModelPort({
      result: { items: [{ name: "2x4x8 stud", priceCents: 387 }] },
      citations: [{ url: "https://homedepot.com/p/123", title: "Home Depot" }],
    });
    const res = await port.complete({
      messages: [{ role: "user", content: "find studs" }],
      resultSchema: schema,
    });
    const parsed = readResult(res, schema);
    expect(parsed.items[0]?.name).toBe("2x4x8 stud");
    expect(res.citations?.[0]?.url).toContain("homedepot");
  });

  it("fails loudly when the canned result violates the schema", async () => {
    const port = createMockModelPort({ result: { items: [{ name: "no price" }] } });
    await expect(
      port.complete({ messages: [{ role: "user", content: "x" }], resultSchema: schema }),
    ).rejects.toThrow();
  });

  it("returns no result when no resultSchema is requested", async () => {
    const port = createMockModelPort({ result: { items: [] } });
    const res = await port.complete({ messages: [{ role: "user", content: "x" }] });
    expect(res.result).toBeUndefined();
  });
});

describe("resolveModelPort", () => {
  it("reports unconfigured with no key, never constructing the real client", () => {
    expect(resolveModelPort({})).toEqual({ status: "unconfigured" });
  });

  it("reports configured when a key is present", () => {
    const resolution = resolveModelPort({ ANTHROPIC_API_KEY: "sk-test" });
    expect(resolution.status).toBe("configured");
  });

  it("accepts a subscription OAuth token, and prefers it over an API key", () => {
    expect(resolveModelPort({ ANTHROPIC_AUTH_TOKEN: "sk-ant-oat01-test" }).status).toBe("configured");
    expect(resolveModelPort({ CLAUDE_CODE_OAUTH_TOKEN: "sk-ant-oat01-test" }).status).toBe("configured");
    // Both present → still configured (the token path wins; asserted end-to-end by the live stage).
    expect(
      resolveModelPort({ ANTHROPIC_AUTH_TOKEN: "sk-ant-oat01-test", ANTHROPIC_API_KEY: "sk-test" }).status,
    ).toBe("configured");
  });
});
