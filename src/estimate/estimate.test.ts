/**
 * Estimate-module tests (add-estimate-dashboard). Prove that costs entered → price solved to
 * the target margin by the engine, that a total-price override makes margin an outcome, and
 * that the module never invents math (every number traces to the engine). Uses the reference
 * business rates ($50/hr recovery, $43.75/hr burdened).
 */

import { describe, expect, it } from "vitest";
import { computeEstimate, toEngineLine, activeVersion, type StoredEstimate } from "./estimate";

const RATES = { overheadRecoveryRate: 5000, burdenedLaborRate: 4375 } as const;

/** A clean job: 8 labor hours + $50 of material, 45% target margin, 10% contingency. */
const JOB: StoredEstimate = {
  targetMarginBp: 4500,
  contingencyBp: 1000,
  lines: [
    { category: "labor", laborMinutes: 480 },
    { category: "material", quantity: 4, unitCostCents: 1250 },
  ],
};

describe("toEngineLine", () => {
  it("maps labor and non-labor lines to the engine shape", () => {
    expect(toEngineLine({ category: "labor", laborMinutes: 480 })).toEqual({
      category: "labor",
      laborMinutes: 480,
    });
    expect(toEngineLine({ category: "material", quantity: 4, unitCostCents: 1250 })).toEqual({
      category: "material",
      quantity: 4,
      unitCostCents: 1250,
    });
  });

  it("carries a per-line price override when present", () => {
    expect(toEngineLine({ category: "labor", laborMinutes: 60, priceCents: 9999 })).toEqual({
      category: "labor",
      laborMinutes: 60,
      price: 9999,
    });
  });
});

describe("computeEstimate — margin-solve by default", () => {
  it("solves the price so net margin hits the target", () => {
    const result = computeEstimate(JOB, RATES);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { rollUp, price, priceSource, directCost, laborHours } = result.value;

    expect(priceSource).toBe("solved");
    expect(directCost).toBe(40_000); // 8h × $43.75 + 4 × $12.50 = $350 + $50
    expect(laborHours).toBe(8);
    expect(rollUp.overheadAllocated).toBe(40_000); // 8h × $50/hr
    expect(rollUp.contingency).toBe(8_000); // 10% of (40k + 40k)
    expect(price).toBe(160_000); // $88 total cost ÷ (1 − 0.45)
    expect(rollUp.netProfit).toBe(72_000);
    expect(rollUp.netMargin.ok && rollUp.netMargin.value).toBe(4_500);
    expect(rollUp.eph.ok && rollUp.eph.value).toBe(9_000); // $90/hr
  });

  it("returns not-applicable when the target margin is unreachable (≥100%)", () => {
    const result = computeEstimate({ ...JOB, targetMarginBp: 10_000 }, RATES);
    expect(result.ok).toBe(false);
  });
});

describe("computeEstimate — total-price override", () => {
  it("makes margin an outcome instead of re-solving", () => {
    const result = computeEstimate({ ...JOB, totalPriceOverrideCents: 150_000 }, RATES);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.priceSource).toBe("override");
    expect(result.value.price).toBe(150_000);
    expect(result.value.rollUp.netProfit).toBe(62_000); // 150k − 88k total cost
    expect(result.value.rollUp.eph.ok && result.value.rollUp.eph.value).toBe(7_750);
  });
});

describe("activeVersion", () => {
  it("returns the active version or null", () => {
    const versions = [
      { id: "a", isActive: false },
      { id: "b", isActive: true },
    ];
    expect(activeVersion(versions)?.id).toBe("b");
    expect(activeVersion([{ id: "a", isActive: false }])).toBeNull();
  });
});
