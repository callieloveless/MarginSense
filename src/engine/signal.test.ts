import { describe, it, expect } from "vitest";
import { defined, notApplicable, valueOr } from "./money";
import { resolveConfig } from "./config";
import type { ComparativeInput } from "./signal";
import {
  portfolioFigures,
  signalAbsolute,
  signalAggregate,
  signalComparative,
} from "./signal";

/** Read the color out of a computed signal, or "n/a". */
function colorOf(
  signal: ReturnType<typeof signalAbsolute> | ReturnType<typeof signalComparative>,
): string {
  return signal.ok ? signal.value.color : "n/a";
}

describe("absolute view — ratio thresholds (EPH / targetProfitPerHour)", () => {
  it("green at or above target (ratio 1.00)", () => {
    expect(colorOf(signalAbsolute(defined(10_000), defined(10_000)))).toBe("green");
  });

  it("yellow just below target (ratio 0.99)", () => {
    expect(colorOf(signalAbsolute(defined(9_900), defined(10_000)))).toBe("yellow");
  });

  it("yellow at the lower boundary (ratio 0.80)", () => {
    expect(colorOf(signalAbsolute(defined(8_000), defined(10_000)))).toBe("yellow");
  });

  it("red just below the boundary (ratio 0.79)", () => {
    expect(colorOf(signalAbsolute(defined(7_900), defined(10_000)))).toBe("red");
  });

  it("reference estimate reads deep green (ratio ≈ 2.4)", () => {
    const signal = signalAbsolute(defined(20_901), defined(8_750));
    expect(signal.ok).toBe(true);
    if (signal.ok) {
      expect(signal.value.color).toBe("green");
      expect(signal.value.ratio).toBeCloseTo(2.389, 2);
    }
  });

  it("negative net profit (negative EPH) reads red", () => {
    expect(colorOf(signalAbsolute(defined(-5_000), defined(8_750)))).toBe("red");
  });

  it("carries its inputs for the explain panel", () => {
    const signal = signalAbsolute(defined(20_901), defined(8_750));
    expect(signal.ok).toBe(true);
    if (signal.ok) {
      expect(signal.value.eph).toBe(20_901);
      expect(signal.value.targetProfitPerHour).toBe(8_750);
      expect(typeof signal.value.ratio).toBe("number");
    }
  });

  it("not-applicable when EPH is undefined (no labor hours)", () => {
    const signal = signalAbsolute(notApplicable("no labor hours"), defined(8_750));
    expect(signal.ok).toBe(false);
  });

  it("respects per-business threshold overrides", () => {
    // ratio 1.05: green by default, but yellow for a business whose green cutoff is 1.10
    expect(colorOf(signalAbsolute(defined(10_500), defined(10_000)))).toBe("green");
    const strict = resolveConfig({ thresholds: { green: 1.1 } });
    expect(colorOf(signalAbsolute(defined(10_500), defined(10_000), strict))).toBe(
      "yellow",
    );
  });
});

/** Base comparative input; individual tests override the share-driving fields. */
const COMPARATIVE_BASE: ComparativeInput = {
  laborHours: 10,
  netProfit: 100,
  overheadAllocated: 0,
  totalHours: 100,
  totalProfit: 1_000,
  annualBillableHours: 1_200,
  grossProfitGoal: 16_500_000,
};

describe("comparative view — weight thresholds (profitShare / hourShare)", () => {
  it("green at weight 1.00", () => {
    // 10% of hours, 10% of profit
    expect(
      colorOf(signalComparative({ ...COMPARATIVE_BASE, netProfit: 100, totalProfit: 1_000 })),
    ).toBe("green");
  });

  it("yellow at weight 0.99", () => {
    expect(
      colorOf(signalComparative({ ...COMPARATIVE_BASE, netProfit: 99, totalProfit: 1_000 })),
    ).toBe("yellow");
  });

  it("yellow at the lower boundary (weight 0.80)", () => {
    expect(
      colorOf(signalComparative({ ...COMPARATIVE_BASE, netProfit: 80, totalProfit: 1_000 })),
    ).toBe("yellow");
  });

  it("red just below the boundary (weight 0.79)", () => {
    expect(
      colorOf(signalComparative({ ...COMPARATIVE_BASE, netProfit: 79, totalProfit: 1_000 })),
    ).toBe("red");
  });

  it("item pulls its weight — 20% hours, 25% profit → weight 1.25 → green", () => {
    const signal = signalComparative({
      ...COMPARATIVE_BASE,
      laborHours: 20,
      totalHours: 100,
      netProfit: 25,
      totalProfit: 100,
    });
    expect(signal.ok).toBe(true);
    if (signal.ok) {
      expect(signal.value.weight).toBeCloseTo(1.25, 10);
      expect(signal.value.color).toBe("green");
    }
  });

  it("item drags the set — 40% hours, 20% profit → weight 0.50 → red", () => {
    const signal = signalComparative({
      ...COMPARATIVE_BASE,
      laborHours: 40,
      totalHours: 100,
      netProfit: 20,
      totalProfit: 100,
    });
    expect(signal.ok).toBe(true);
    if (signal.ok) {
      expect(signal.value.weight).toBeCloseTo(0.5, 10);
      expect(signal.value.color).toBe("red");
    }
  });

  it("negative net profit reads red", () => {
    expect(
      colorOf(signalComparative({ ...COMPARATIVE_BASE, netProfit: -500, totalProfit: 1_000 })),
    ).toBe("red");
  });

  it("not-applicable when the set has no hours, no profit, or the job has no hours", () => {
    expect(signalComparative({ ...COMPARATIVE_BASE, totalHours: 0 }).ok).toBe(false);
    expect(signalComparative({ ...COMPARATIVE_BASE, totalProfit: 0 }).ok).toBe(false);
    expect(signalComparative({ ...COMPARATIVE_BASE, laborHours: 0 }).ok).toBe(false);
  });
});

describe("portfolio figures for the reference job", () => {
  const figures = portfolioFigures({
    laborHours: 64,
    annualBillableHours: 1_200,
    netProfit: 1_337_650,
    overheadAllocated: 320_000,
    grossProfitGoal: 16_500_000,
  });

  it("percentOfYear ≈ 5.3% (64 / 1,200)", () => {
    expect(valueOr(figures.percentOfYear, -1)).toBeCloseTo(0.0533, 4);
  });

  it("percentOfProfitGoal ≈ 10.05% ($16,576.50 / $165,000)", () => {
    expect(valueOr(figures.percentOfProfitGoal, -1)).toBeCloseTo(0.1005, 4);
  });

  it("not-applicable when the business has no capacity or no goal", () => {
    const none = portfolioFigures({
      laborHours: 64,
      annualBillableHours: 0,
      netProfit: 1_337_650,
      overheadAllocated: 320_000,
      grossProfitGoal: 0,
    });
    expect(none.percentOfYear.ok).toBe(false);
    expect(none.percentOfProfitGoal.ok).toBe(false);
  });
});

describe("comparative signal carries the portfolio figures for the explain panel", () => {
  it("includes hour share, profit share, weight, and both percentages", () => {
    const signal = signalComparative({
      laborHours: 64,
      netProfit: 1_337_650,
      overheadAllocated: 320_000,
      totalHours: 1_200,
      totalProfit: 26_753_000, // 20 identical jobs
      annualBillableHours: 1_200,
      grossProfitGoal: 16_500_000,
    });
    expect(signal.ok).toBe(true);
    if (signal.ok) {
      expect(signal.value.hourShare).toBeCloseTo(64 / 1_200, 10);
      expect(signal.value.profitShare).toBeCloseTo(1_337_650 / 26_753_000, 10);
      expect(valueOr(signal.value.percentOfYear, -1)).toBeCloseTo(0.0533, 4);
      expect(valueOr(signal.value.percentOfProfitGoal, -1)).toBeCloseTo(0.1005, 4);
    }
  });
});

describe("portfolio aggregate — signalAggregate (§3.5)", () => {
  it("blends Σnet / Σhours, computes the shortfall, and colours it", () => {
    // 1,800,000¢ over 240 hrs = $75/hr vs an $87.50 target → yellow, $12.50/hr short.
    const pulse = signalAggregate(1_800_000, 240, defined(8_750));
    expect(pulse.ok).toBe(true);
    if (!pulse.ok) return;
    expect(pulse.value.aggregateProfitPerHour).toBe(7_500);
    expect(pulse.value.shortfallPerHour).toBe(1_250);
    expect(pulse.value.signal.color).toBe("yellow");
  });

  it("clamps the shortfall to zero at or above target (green)", () => {
    const pulse = signalAggregate(2_400_000, 240, defined(8_750)); // $100/hr
    if (!pulse.ok) return;
    expect(pulse.value.shortfallPerHour).toBe(0);
    expect(pulse.value.signal.color).toBe("green");
  });

  it("reads red and over-shortfall when the set loses money", () => {
    const pulse = signalAggregate(-240_000, 240, defined(8_750)); // −$10/hr
    if (!pulse.ok) return;
    expect(pulse.value.aggregateProfitPerHour).toBe(-1_000);
    expect(pulse.value.signal.color).toBe("red");
    expect(pulse.value.shortfallPerHour).toBe(9_750); // target − (−1000)
  });

  it("is not-applicable when the set has no labor hours", () => {
    expect(signalAggregate(500_000, 0, defined(8_750)).ok).toBe(false);
  });

  it("honours the thresholds at the boundaries", () => {
    expect(signalAggregate(8_000, 1, defined(10_000)).ok && "yellow"); // ratio 0.80
    const y = signalAggregate(8_000, 1, defined(10_000));
    const r = signalAggregate(7_900, 1, defined(10_000));
    expect(y.ok && y.value.signal.color).toBe("yellow");
    expect(r.ok && r.value.signal.color).toBe("red");
  });
});
