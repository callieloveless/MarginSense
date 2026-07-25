import { describe, expect, it } from "vitest";
import { parseClientDocument } from "./document";

/** A minimal valid client document — one line, subtotal = line, total = subtotal (no tax). */
const minimal = {
  businessName: "Acme Remodeling",
  clientName: "Jane Homeowner",
  title: "Bathroom remodel — proposal",
  preparedOn: "July 25, 2026",
  lines: [{ description: "Tile the shower surround", priceCents: 180_000 }],
  subtotalCents: 180_000,
  totalCents: 180_000,
};

/** A fuller valid document with tax and optional identity/prose. */
const full = {
  businessName: "Acme Remodeling",
  tradeType: "General contractor",
  serviceArea: "Austin, TX",
  license: "TX-123456",
  clientName: "Jane Homeowner",
  clientAddress: "12 Oak St, Austin, TX",
  title: "Bathroom remodel — proposal",
  preparedOn: "July 25, 2026",
  intro: "We'll remove the old surround, waterproof, and tile to the ceiling.",
  lines: [
    { description: "Demo and haul-away", priceCents: 40_000 },
    { description: "Waterproofing and tile", priceCents: 180_000 },
  ],
  subtotalCents: 220_000,
  taxCents: 18_150,
  totalCents: 238_150,
  terms: "50% deposit to schedule; balance on completion.",
};

describe("client document — validation", () => {
  it("accepts a minimal valid payload", () => {
    expect(parseClientDocument(minimal).ok).toBe(true);
  });

  it("accepts a full payload with tax, identity, and prose", () => {
    const result = parseClientDocument(full);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.totalCents).toBe(238_150);
  });

  it("requires at least one line and the core identity fields", () => {
    expect(parseClientDocument({ ...minimal, lines: [] }).ok).toBe(false);
    const { businessName: _omit, ...noBusiness } = minimal;
    expect(parseClientDocument(noBusiness).ok).toBe(false);
  });
});

describe("client document — nothing internal can be stored", () => {
  it("rejects a cost/margin/EPH/labor-minutes/signal field on the document", () => {
    for (const leak of [
      { costCents: 90_000 },
      { marginBp: 4_000 },
      { eph: 8_500 },
      { laborMinutes: 480 },
      { signal: "green" },
      { overheadCents: 12_000 },
    ]) {
      const result = parseClientDocument({ ...minimal, ...leak });
      expect(result.ok, `should reject ${JSON.stringify(leak)}`).toBe(false);
    }
  });

  it("rejects an internal field smuggled onto a line", () => {
    const withCost = {
      ...minimal,
      lines: [{ description: "Tile", priceCents: 180_000, costCents: 90_000 }],
    };
    expect(parseClientDocument(withCost).ok).toBe(false);
  });
});

describe("client document — the numbers must add up", () => {
  it("rejects a subtotal that isn't the sum of the lines", () => {
    const result = parseClientDocument({ ...full, subtotalCents: 999_999 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/subtotal/i);
  });

  it("rejects a total that isn't subtotal plus tax", () => {
    const result = parseClientDocument({ ...full, totalCents: 999_999 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/total/i);
  });

  it("requires integer cents", () => {
    expect(parseClientDocument({ ...minimal, subtotalCents: 180_000.5, totalCents: 180_000.5 }).ok).toBe(
      false,
    );
  });
});
