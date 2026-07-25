/**
 * Client Estimate Doc tests (add-client-estimate-doc). The tool returns a client-safe document as
 * its typed output — no suggestion — with the numbers from the pure projection and an optional AI
 * scope narrative. What matters: the output is a valid `ClientDocument`, no suggestion is emitted,
 * the narrative is present only when asked, an unpriceable estimate errors, and a model failure
 * doesn't sink the document.
 */

import { describe, expect, it } from "vitest";
import { createMockModelPort } from "../../ai";
import { parseClientDocument } from "../../document";
import { buildProjectSnapshot, type ProjectSnapshot } from "../../context";
import { clientEstimateDocTool } from "./client-estimate-doc";
import { type ClientEstimateDocInput } from "./schema";

const input: ClientEstimateDocInput = {
  businessName: "Acme Remodeling",
  tradeType: "General contractor",
  clientName: "Jane Homeowner",
  title: "Bathroom remodel",
  preparedOn: "July 25, 2026",
  lines: [
    { description: "Demo and haul-away", costCents: 40_000, hasPriceOverride: false },
    { description: "Waterproof and tile", costCents: 180_000, hasPriceOverride: false },
  ],
  totalPriceCents: 500_000,
  taxRateBp: 825,
  writeNarrative: false,
};

const snapshot: ProjectSnapshot = buildProjectSnapshot({
  projectId: "p-1",
  entries: [],
  conversation: [],
});

function run(overrides: Partial<ClientEstimateDocInput> = {}, reply?: (r: unknown) => string) {
  const ai = createMockModelPort(reply ? { reply: reply as never } : {});
  return clientEstimateDocTool.run({ snapshot, input: { ...input, ...overrides }, ai });
}

describe("Client Estimate Doc — output", () => {
  it("returns a valid client document and no suggestion", async () => {
    const out = await run();
    expect(out.suggestions ?? []).toHaveLength(0);
    const parsed = parseClientDocument(out.output);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.value.subtotalCents).toBe(500_000);
      expect(parsed.value.taxCents).toBe(41_250);
      expect(parsed.value.totalCents).toBe(541_250);
      expect(parsed.value.lines.reduce((a, l) => a + l.priceCents, 0)).toBe(500_000);
    }
  });

  it("carries no internal figure on the output", async () => {
    const out = await run();
    expect(JSON.stringify(out.output)).not.toMatch(/cost|margin|eph|laborMinutes|quantity|overhead/i);
  });

  it("posts a review-before-you-share message", async () => {
    const out = await run();
    expect(out.message?.body).toMatch(/review it before you share/i);
  });
});

describe("Client Estimate Doc — the optional narrative", () => {
  it("adds a scope narrative when writeNarrative is set", async () => {
    const out = await run({ writeNarrative: true }, () => "We'll remove the old surround and tile to the ceiling.");
    expect((out.output as { intro?: string }).intro).toMatch(/surround/i);
  });

  it("omits the narrative when not asked", async () => {
    const out = await run({ writeNarrative: false });
    expect((out.output as { intro?: string }).intro).toBeUndefined();
  });

  it("still produces a valid document if the model returns nothing", async () => {
    const out = await run({ writeNarrative: true }, () => "");
    expect((out.output as { intro?: string }).intro).toBeUndefined();
    expect(parseClientDocument(out.output).ok).toBe(true);
  });
});

describe("Client Estimate Doc — refusals", () => {
  it("errors when the estimate has a per-line override", async () => {
    await expect(
      run({ lines: [{ description: "x", costCents: 1, hasPriceOverride: true }] }),
    ).rejects.toThrow(/per-line prices/i);
  });

  it("errors when the estimate isn't priced", async () => {
    await expect(run({ totalPriceCents: 0 })).rejects.toThrow();
  });
});
