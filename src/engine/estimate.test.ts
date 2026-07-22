import { describe, it, expect } from "vitest";
import type { LineItem } from "./estimate";
import {
  lineCost,
  lineLaborHours,
  rollUpEstimate,
  rollUpTotals,
  solvePriceForMargin,
} from "./estimate";
import { valueOr } from "./money";

describe("line-item cost & hours", () => {
  it("computes a labor line's cost from minutes and the burdened rate (spec scenario)", () => {
    const line: LineItem = { category: "labor", laborMinutes: 90 };
    expect(lineCost(line, 6_000)).toBe(9_000); // 1.5 hr × $60/hr
    expect(lineLaborHours(line)).toBe(1.5);
  });

  it("computes a non-labor line's cost from quantity and unit cost (spec scenario)", () => {
    const line: LineItem = { category: "material", quantity: 4, unitCostCents: 1_250 };
    expect(lineCost(line, 6_000)).toBe(5_000);
    expect(lineLaborHours(line)).toBe(0); // non-labor contributes no hours
  });
});

describe("estimate roll-up — reconciles the reference mockup", () => {
  const rollUp = rollUpTotals({
    revenue: 2_972_500,
    directCost: 1_237_000,
    laborHours: 64,
    overheadRecoveryRate: 5_000,
    contingencyBp: 500,
  });

  it("allocates overhead as laborHours × recovery rate ($3,200)", () => {
    expect(rollUp.overheadAllocated).toBe(320_000);
  });

  it("reserves contingency on directCost + overhead ($778.50)", () => {
    expect(rollUp.contingency).toBe(77_850);
  });

  it("nets profit after cost, overhead, and contingency ($13,376.50)", () => {
    expect(rollUp.netProfit).toBe(1_337_650);
  });

  it("reports net margin as 45.0% (4500 bp)", () => {
    expect(valueOr(rollUp.netMargin, -1)).toBe(4_500);
  });

  it("reports EPH ≈ $209/hr (20,901 ¢/hr)", () => {
    expect(valueOr(rollUp.eph, -1)).toBe(20_901);
  });
});

describe("estimate roll-up — edge cases", () => {
  it("zero labor hours → EPH not-applicable, overhead zero", () => {
    const rollUp = rollUpTotals({
      revenue: 500_000,
      directCost: 200_000,
      laborHours: 0,
      overheadRecoveryRate: 5_000,
      contingencyBp: 500,
    });
    expect(rollUp.overheadAllocated).toBe(0);
    expect(rollUp.eph.ok).toBe(false);
    expect(valueOr(rollUp.netMargin, -1)).toBeGreaterThan(0);
  });

  it("zero revenue → gross & net margin not-applicable, net profit negative", () => {
    const rollUp = rollUpTotals({
      revenue: 0,
      directCost: 200_000,
      laborHours: 10,
      overheadRecoveryRate: 5_000,
      contingencyBp: 500,
    });
    expect(rollUp.grossMargin.ok).toBe(false);
    expect(rollUp.netMargin.ok).toBe(false);
    expect(rollUp.netProfit).toBeLessThan(0);
  });

  it("revenue below full cost → negative net profit and negative EPH", () => {
    const rollUp = rollUpTotals({
      revenue: 200_000,
      directCost: 200_000,
      laborHours: 10,
      overheadRecoveryRate: 5_000,
      contingencyBp: 500,
    });
    // overhead 50,000 + contingency 12,500 pushes cost past revenue
    expect(rollUp.netProfit).toBe(-62_500);
    expect(valueOr(rollUp.eph, 0)).toBeLessThan(0);
  });
});

describe("line-based roll-up delegates to the aggregate", () => {
  it("sums revenue, cost, and hours across lines", () => {
    const lines: LineItem[] = [
      { category: "labor", laborMinutes: 120, price: 50_000 }, // 2 hr → cost 8,750
      { category: "material", quantity: 3, unitCostCents: 10_000, price: 40_000 }, // cost 30,000
    ];
    const rollUp = rollUpEstimate({
      lines,
      overheadRecoveryRate: 5_000,
      burdenedLaborRate: 4_375,
      contingencyBp: 500,
    });
    expect(rollUp.revenue).toBe(90_000);
    expect(rollUp.directCost).toBe(38_750);
    expect(rollUp.laborHours).toBe(2);
    expect(rollUp.overheadAllocated).toBe(10_000);
    expect(rollUp.contingency).toBe(2_438); // 5% of 48,750, half-up
    expect(rollUp.netProfit).toBe(38_812);
  });
});

describe("margin-solve pricing", () => {
  const solveInput = {
    directCost: 1_237_000,
    laborHours: 64,
    overheadRecoveryRate: 5_000,
    contingencyBp: 500,
    targetMarginBp: 4_500, // 45%
  };

  it("solves the total price to hit the target margin (spec scenario)", () => {
    const solved = solvePriceForMargin(solveInput);
    expect(solved.ok).toBe(true);
    if (!solved.ok) return;

    const totalCost = 1_237_000 + 320_000 + 77_850; // 1,634,850
    const exact = totalCost / (1 - 0.45); // 2,972,454.5454…
    // whole-cent price within one cent of the exact solve (≈ $29,725 on the deck)
    expect(Math.abs(solved.value.price - exact)).toBeLessThan(1);
    expect(solved.value.price).toBe(2_972_455);
    // recomputed net margin is within one cent of 45%
    expect(valueOr(solved.value.rollUp.netMargin, -1)).toBe(4_500);
  });

  it("treats a user-entered price as an override — margin becomes an outcome, not re-solved", () => {
    // The user overrides the total to a round $30,000 instead of the solved price.
    const rollUp = rollUpTotals({
      revenue: 3_000_000,
      directCost: 1_237_000,
      laborHours: 64,
      overheadRecoveryRate: 5_000,
      contingencyBp: 500,
    });
    // margin is computed from the entered price (45.51%), not forced to the 45% target
    expect(valueOr(rollUp.netMargin, -1)).toBe(4_551);
  });

  it("returns not-applicable for an unreachable margin (≥ 100%)", () => {
    const solved = solvePriceForMargin({ ...solveInput, targetMarginBp: 10_000 });
    expect(solved.ok).toBe(false);
  });
});
