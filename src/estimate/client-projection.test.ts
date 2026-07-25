/**
 * Estimate → client-document projection (add-client-estimate-doc). The money-critical part of the
 * whole change: the allocated line prices must sum **exactly** to the total (the document schema
 * rejects anything else), internal figures must never cross over, and the projection must refuse
 * rather than produce a misleading document.
 */

import { describe, expect, it } from "vitest";
import { projectClientDocument, type ClientProjectionInput } from "./client-projection";

const base: ClientProjectionInput = {
  businessName: "Acme Remodeling",
  clientName: "Jane Homeowner",
  title: "Bathroom remodel",
  preparedOn: "July 25, 2026",
  lines: [
    { description: "Demo", costCents: 40_000, hasPriceOverride: false },
    { description: "Tile", costCents: 180_000, hasPriceOverride: false },
    { description: "Fixtures", costCents: 55_000, hasPriceOverride: false },
  ],
  totalPriceCents: 500_000,
};

/** Sum of a projected document's line prices. */
function lineSum(lines: readonly { priceCents: number }[]): number {
  return lines.reduce((a, l) => a + l.priceCents, 0);
}

describe("projectClientDocument — allocation is exact", () => {
  it("splits the total across lines so they sum exactly to the subtotal", () => {
    const r = projectClientDocument(base);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(lineSum(r.value.lines)).toBe(500_000);
    expect(r.value.subtotalCents).toBe(500_000);
    expect(r.value.totalCents).toBe(500_000);
    // Proportional to cost: Tile (the largest cost) gets the largest price.
    const prices = r.value.lines.map((l) => l.priceCents);
    expect(Math.max(...prices)).toBe(prices[1]);
  });

  it("handles an uneven split that doesn't land on whole cents, still summing to the total", () => {
    const r = projectClientDocument({
      ...base,
      lines: [
        { description: "A", costCents: 1, hasPriceOverride: false },
        { description: "B", costCents: 1, hasPriceOverride: false },
        { description: "C", costCents: 1, hasPriceOverride: false },
      ],
      totalPriceCents: 100_00, // $100 across three equal thirds → 3333/3333/3334
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(lineSum(r.value.lines)).toBe(100_00);
  });

  it("gives a single line the whole total", () => {
    const r = projectClientDocument({
      ...base,
      lines: [{ description: "All of it", costCents: 90_000, hasPriceOverride: false }],
      totalPriceCents: 300_000,
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.lines).toEqual([{ description: "All of it", priceCents: 300_000 }]);
  });

  it("computes tax and keeps the total = subtotal + tax", () => {
    const r = projectClientDocument({ ...base, taxRateBp: 825 }); // 8.25%
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.subtotalCents).toBe(500_000);
    expect(r.value.taxCents).toBe(41_250);
    expect(r.value.totalCents).toBe(541_250);
  });
});

describe("projectClientDocument — nothing internal, and zero-cost lines dropped", () => {
  it("a client line carries only a description and a price", () => {
    const r = projectClientDocument(base);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    for (const line of r.value.lines) {
      expect(Object.keys(line).sort()).toEqual(["description", "priceCents"]);
    }
    // And the payload as a whole has no internal field.
    expect(JSON.stringify(r.value)).not.toMatch(/cost|margin|eph|laborMinutes|quantity|overhead/i);
  });

  it("drops a zero-cost line but still sums to the total", () => {
    const r = projectClientDocument({
      ...base,
      lines: [
        { description: "Priced work", costCents: 100_000, hasPriceOverride: false },
        { description: "Free throw-in", costCents: 0, hasPriceOverride: false },
      ],
      totalPriceCents: 250_000,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.lines).toHaveLength(1);
    expect(r.value.lines[0]!.description).toBe("Priced work");
    expect(lineSum(r.value.lines)).toBe(250_000);
  });
});

describe("projectClientDocument — refusals", () => {
  it("refuses when any line has a per-line override", () => {
    const r = projectClientDocument({
      ...base,
      lines: [
        { description: "Demo", costCents: 40_000, hasPriceOverride: false },
        { description: "Tile", costCents: 180_000, hasPriceOverride: true },
      ],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/per-line prices/i);
  });

  it("still generates when only the TOTAL is overridden (no per-line)", () => {
    // A total override reaches the projection simply as `totalPriceCents`; no line is overridden.
    const r = projectClientDocument({ ...base, totalPriceCents: 610_000 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(lineSum(r.value.lines)).toBe(610_000);
  });

  it("refuses an unpriced estimate", () => {
    expect(projectClientDocument({ ...base, totalPriceCents: 0 }).ok).toBe(false);
  });

  it("refuses when every line is zero-cost (nothing to allocate)", () => {
    const r = projectClientDocument({
      ...base,
      lines: [{ description: "Free", costCents: 0, hasPriceOverride: false }],
      totalPriceCents: 100_000,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/no priced work/i);
  });
});
