import { describe, it, expect } from "vitest";
import type { LineItem } from "./estimate";
import {
  allocateByWeight,
  lineBreakdowns,
  lineCost,
  lineLaborHours,
  rollUpEstimate,
  rollUpTotals,
  solvePriceForMargin,
} from "./estimate";
import type { Cents, CentsPerHour, Computed } from "./money";
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

describe("allocateByWeight (§3.4a — the one allocation method)", () => {
  it("splits proportional to weight and sums to the total exactly", () => {
    expect(allocateByWeight(100_000, [3, 1])).toEqual([75_000, 25_000]);
    const parts = allocateByWeight(100_000, [1, 1, 1]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(100_000);
  });

  it("places the rounding remainder on the largest-weight line (ties → earliest)", () => {
    // 10 across three equal weights → 3,3,3 leaves 1; earliest max index gets it.
    expect(allocateByWeight(10, [1, 1, 1])).toEqual([4, 3, 3]);
    // Unequal: the true largest weight absorbs the remainder.
    expect(allocateByWeight(10, [1, 2, 1])).toEqual([3, 4, 3]);
  });

  it("all-zero weights → split total equally (never drop it), remainder on the first line", () => {
    // No proportional basis, but the parts must still sum to the total.
    expect(allocateByWeight(100_000, [0, 0])).toEqual([50_000, 50_000]);
    const three = allocateByWeight(100_000, [0, 0, 0]);
    expect(three).toEqual([33_334, 33_333, 33_333]);
    expect(three.reduce((a, b) => a + b, 0)).toBe(100_000);
  });

  it("zero total or empty input → zeros / empty", () => {
    expect(allocateByWeight(0, [0, 0, 0])).toEqual([0, 0, 0]);
    expect(allocateByWeight(100_000, [])).toEqual([]);
  });
});

describe("lineBreakdowns (§3.4a — per-line net + signal)", () => {
  const target = (v: number): Computed<CentsPerHour> => ({ ok: true, value: v });
  const colorOf = (s: ReturnType<typeof lineBreakdowns>[number]) =>
    s.signal.ok ? s.signal.value.color : "na";

  it("reconciles: Σ per-line net === estimate netProfit", () => {
    // The reference solved job: labor 8h (cost $350) + $50 material, priced $1,600 total.
    const lines: LineItem[] = [
      { category: "labor", laborMinutes: 480 },
      { category: "material", quantity: 4, unitCostCents: 1_250 },
    ];
    const prices: Cents[] = [140_000, 20_000]; // Σ = 160,000 revenue
    const rollUp = rollUpTotals({
      revenue: 160_000,
      directCost: 40_000,
      laborHours: 8,
      overheadRecoveryRate: 5_000,
      contingencyBp: 1_000,
    });
    const bd = lineBreakdowns({
      lines,
      prices,
      burdenedLaborRate: 4_375,
      overheadAllocated: rollUp.overheadAllocated,
      contingency: rollUp.contingency,
      targetProfitPerHour: target(8_750),
    });
    expect(bd.reduce((a, l) => a + l.net, 0)).toBe(rollUp.netProfit); // 72,000
    // overhead + contingency shares sum exactly to the estimate totals
    expect(bd.reduce((a, l) => a + l.overheadAllocated, 0)).toBe(rollUp.overheadAllocated);
    expect(bd.reduce((a, l) => a + l.contingencyShare, 0)).toBe(rollUp.contingency);
  });

  it("signals green/yellow/red on the same thresholds (labor lines), at the boundaries", () => {
    // Isolate the signal: zero cost/overhead/contingency so profit-per-hour === price, 1 hr.
    const one = (price: number) =>
      lineBreakdowns({
        lines: [{ category: "labor", laborMinutes: 60 }],
        prices: [price],
        burdenedLaborRate: 0,
        overheadAllocated: 0,
        contingency: 0,
        targetProfitPerHour: target(10_000),
      })[0]!;
    expect(colorOf(one(10_000))).toBe("green"); // ratio 1.00
    expect(colorOf(one(9_900))).toBe("yellow"); // 0.99
    expect(colorOf(one(8_000))).toBe("yellow"); // 0.80
    expect(colorOf(one(7_900))).toBe("red"); // 0.79
  });

  it("non-labor lines carry no per-hour signal", () => {
    const bd = lineBreakdowns({
      lines: [{ category: "material", quantity: 1, unitCostCents: 1_000 }],
      prices: [5_000],
      burdenedLaborRate: 4_375,
      overheadAllocated: 0,
      contingency: 0,
      targetProfitPerHour: target(8_750),
    })[0]!;
    expect(bd.profitPerHour.ok).toBe(false);
    expect(bd.signal.ok).toBe(false);
  });

  it("zero-hour labor line → profit-per-hour not-applicable (no divide-by-zero)", () => {
    const bd = lineBreakdowns({
      lines: [{ category: "labor", laborMinutes: 0 }],
      prices: [5_000],
      burdenedLaborRate: 4_375,
      overheadAllocated: 0,
      contingency: 0,
      targetProfitPerHour: target(8_750),
    })[0]!;
    expect(bd.profitPerHour.ok).toBe(false);
    expect(bd.signal.ok).toBe(false);
  });

  it("no target → per-line signal not-applicable", () => {
    const bd = lineBreakdowns({
      lines: [{ category: "labor", laborMinutes: 60 }],
      prices: [50_000],
      burdenedLaborRate: 4_375,
      overheadAllocated: 5_000,
      contingency: 0,
      targetProfitPerHour: { ok: false, reason: "not provided" },
    })[0]!;
    expect(bd.profitPerHour.ok).toBe(true); // the number still computes
    expect(bd.signal.ok).toBe(false); // but there is no colour without a target
  });
});
