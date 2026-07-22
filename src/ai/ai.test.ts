/**
 * Unit tests for the AI layer (add-tool-platform). Everything here runs offline against the
 * mock port; the resolver is tested with an injected env so no real key is ever needed.
 */

import { describe, expect, it } from "vitest";
import {
  AI_DEFAULTS,
  MODELS,
  createMockModelPort,
  meterModelPort,
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

describe("resolveModelPort", () => {
  it("reports unconfigured with no key, never constructing the real client", () => {
    expect(resolveModelPort({})).toEqual({ status: "unconfigured" });
  });

  it("reports configured when a key is present", () => {
    const resolution = resolveModelPort({ ANTHROPIC_API_KEY: "sk-test" });
    expect(resolution.status).toBe("configured");
  });
});
