/**
 * Profit-module tests (add-estimate-dashboard). Prove per-estimate coloring from the engine's
 * absolute view, portfolio worst-first ranking from the comparative view, and that the
 * reference job reconciles to the spec figures ("5.3% of your year", "10.05% of your profit
 * goal"). All numbers come from the engine; this module only assembles and ranks.
 */

import { describe, expect, it } from "vitest";
import {
  buildPortfolio,
  estimateSignal,
  portfolioPulse,
  type PortfolioJobInput,
} from "./profit";
import { defined, type EstimateRollUp } from "../engine/index";

/** A minimal roll-up carrying just the EPH the signal reads (other fields unused here). */
function rollUpWithEph(eph: number): EstimateRollUp {
  return {
    revenue: 0,
    directCost: 0,
    laborHours: 1,
    overheadAllocated: 0,
    contingency: 0,
    netProfit: 0,
    grossMargin: defined(0),
    netMargin: defined(0),
    eph: defined(eph),
  };
}

describe("estimateSignal", () => {
  it("reads deep green for the reference estimate (EPH ~$209 vs $87.50 target)", () => {
    const signal = estimateSignal(rollUpWithEph(20_900), defined(8_750));
    expect(signal.ok).toBe(true);
    if (!signal.ok) return;
    expect(signal.value.color).toBe("green");
    expect(signal.value.ratio).toBeCloseTo(2.388, 2);
  });

  it("is not-applicable when the estimate has no EPH", () => {
    const rollUp = { ...rollUpWithEph(0), eph: { ok: false as const, reason: "no labor hours" } };
    expect(estimateSignal(rollUp, defined(8_750)).ok).toBe(false);
  });
});

describe("buildPortfolio", () => {
  const business = { annualBillableHours: 1_200, grossProfitGoal: 16_500_000 };

  it("reconciles the reference job against the year", () => {
    const jobs: PortfolioJobInput[] = [
      {
        projectId: "p1",
        projectName: "Reference job",
        laborHours: 64,
        netProfit: 1_337_650,
        overheadAllocated: 320_000,
      },
    ];
    const [job] = buildPortfolio(jobs, business);
    expect(job!.signal.ok).toBe(true);
    if (!job!.signal.ok) return;
    const s = job!.signal.value;

    expect(s.percentOfYear.ok && s.percentOfYear.value).toBeCloseTo(0.0533, 4); // 5.3%
    expect(s.percentOfProfitGoal.ok && s.percentOfProfitGoal.value).toBeCloseTo(0.1005, 4); // 10.05%
  });

  it("ranks the underperforming job first and colors it red", () => {
    // job A: 40% of hours, 20% of profit → weight 0.5 (red). job B: the rest → green.
    const jobs: PortfolioJobInput[] = [
      { projectId: "b", projectName: "Good job", laborHours: 60, netProfit: 80, overheadAllocated: 0 },
      { projectId: "a", projectName: "Weak job", laborHours: 40, netProfit: 20, overheadAllocated: 0 },
    ];
    const ranked = buildPortfolio(jobs, business);

    expect(ranked[0]!.projectId).toBe("a"); // worst first
    expect(ranked[0]!.signal.ok && ranked[0]!.signal.value.color).toBe("red");
    expect(ranked[1]!.signal.ok && ranked[1]!.signal.value.color).toBe("green");
  });

  it("pushes not-applicable jobs (no hours) to the end of the ranking", () => {
    const jobs: PortfolioJobInput[] = [
      { projectId: "a", projectName: "Real", laborHours: 10, netProfit: 100, overheadAllocated: 0 },
      { projectId: "z", projectName: "No hours", laborHours: 0, netProfit: 0, overheadAllocated: 0 },
    ];
    const ranked = buildPortfolio(jobs, business);
    expect(ranked[ranked.length - 1]!.projectId).toBe("z");
  });
});

describe("portfolioPulse", () => {
  it("aggregates the set's net profit and hours into one profit-per-hour + shortfall", () => {
    const jobs: PortfolioJobInput[] = [
      { projectId: "a", projectName: "A", laborHours: 120, netProfit: 1_000_000, overheadAllocated: 0 },
      { projectId: "b", projectName: "B", laborHours: 120, netProfit: 800_000, overheadAllocated: 0 },
    ];
    const pulse = portfolioPulse(jobs, defined(8_750)); // 1,800,000 / 240 = $75/hr
    expect(pulse.ok).toBe(true);
    if (!pulse.ok) return;
    expect(pulse.value.aggregateProfitPerHour).toBe(7_500);
    expect(pulse.value.shortfallPerHour).toBe(1_250);
    expect(pulse.value.signal.color).toBe("yellow");
  });

  it("is not-applicable when no job has labor hours (all drafts)", () => {
    const jobs: PortfolioJobInput[] = [
      { projectId: "z", projectName: "Draft", laborHours: 0, netProfit: 0, overheadAllocated: 0 },
    ];
    expect(portfolioPulse(jobs, defined(8_750)).ok).toBe(false);
  });
});
