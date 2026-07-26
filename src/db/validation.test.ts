/**
 * The estimate editor's line-item parsing seam (revamp-estimate-editor) — the one change that lets a
 * per-line price reach the database (the column, `LineItemInput`, and `saveLineItems` already carry
 * it). A blank price stays unpriced (baseline derived); a value converts dollars → integer cents; a
 * bad value is a plain error; legacy payloads with no price field are unchanged.
 */

import { describe, expect, it } from "vitest";
import { parseLineItems } from "./validation";

describe("parseLineItems — per-line price", () => {
  it("converts an entered dollar price to integer cents", () => {
    const r = parseLineItems([{ category: "labor", laborHours: "8", price: "600" }]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data[0]!.priceCents).toBe(60_000);
  });

  it("leaves a blank price unpriced (null), so the baseline is derived", () => {
    const r = parseLineItems([{ category: "labor", laborHours: "8", price: "" }]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data[0]!.priceCents).toBeNull();
  });

  it("treats an absent price field as unpriced (legacy payload unchanged)", () => {
    const r = parseLineItems([{ category: "material", quantity: "4", unitCost: "12.50" }]);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data[0]!.priceCents).toBeNull();
      expect(r.data[0]!.unitCostCents).toBe(1_250);
    }
  });

  it("prices a non-labor line too", () => {
    const r = parseLineItems([{ category: "material", quantity: "4", unitCost: "12.50", price: "80" }]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data[0]!.priceCents).toBe(8_000);
  });

  it("rejects a non-numeric or negative price with a plain message", () => {
    const bad = parseLineItems([{ category: "labor", laborHours: "8", price: "abc" }]);
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error).toMatch(/price/i);

    const negative = parseLineItems([{ category: "labor", laborHours: "8", price: "-5" }]);
    expect(negative.ok).toBe(false);
  });
});
