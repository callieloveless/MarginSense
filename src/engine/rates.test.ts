import { describe, it, expect } from "vitest";
import type { BusinessSettings } from "./rates";
import { deriveRates } from "./rates";
import { valueOr } from "./money";

/** The reference business from the constitution (§3.3) and open-questions doc. */
const REFERENCE: BusinessSettings = {
  annualOverheadCents: 6_000_000, // $60,000
  ownerWageCentsPerHour: 3_500, // $35/hr
  laborBurdenBp: 2_500, // 25%
  workingDaysPerYear: 200,
  billableMinutesPerDay: 360, // 6 hrs/day
  incomeGoalCents: 9_000_000, // $90,000
  profitTargetCents: 1_500_000, // $15,000
};

describe("deriveRates — reference business", () => {
  const rates = deriveRates(REFERENCE);

  it("derives annual billable time (200 days × 6 hrs = 1,200 hrs)", () => {
    expect(rates.annualBillableMinutes).toBe(72_000);
    expect(rates.annualBillableHours).toBe(1_200);
  });

  it("overhead recovery rate = $60k / 1,200 hrs = $50.00/hr", () => {
    expect(valueOr(rates.overheadRecoveryRate, -1)).toBe(5_000);
  });

  it("burdened labor rate = $35 × 1.25 = $43.75/hr", () => {
    expect(rates.burdenedLaborRate).toBe(4_375);
  });

  it("loaded cost per hour = $50 + $43.75 = $93.75/hr", () => {
    expect(valueOr(rates.loadedCostPerHour, -1)).toBe(9_375);
  });

  it("break-even day rate = $93.75 × 6 = $562.50", () => {
    expect(valueOr(rates.breakEvenDayRate, -1)).toBe(56_250);
  });

  it("gross-profit goal = $60k + $90k + $15k = $165,000", () => {
    expect(rates.grossProfitGoal).toBe(16_500_000);
  });

  it("target profit per hour = ($90k + $15k) / 1,200 = $87.50/hr", () => {
    expect(valueOr(rates.targetProfitPerHour, -1)).toBe(8_750);
  });
});

describe("deriveRates — zero billable hours", () => {
  const rates = deriveRates({ ...REFERENCE, workingDaysPerYear: 0 });

  it("reports capacity-divided rates as not-applicable, never dividing by zero", () => {
    expect(rates.annualBillableHours).toBe(0);
    expect(rates.overheadRecoveryRate.ok).toBe(false);
    expect(rates.loadedCostPerHour.ok).toBe(false);
    expect(rates.breakEvenDayRate.ok).toBe(false);
    expect(rates.targetProfitPerHour.ok).toBe(false);
  });

  it("still defines the rates that do not divide by capacity", () => {
    expect(rates.burdenedLaborRate).toBe(4_375);
    expect(rates.grossProfitGoal).toBe(16_500_000);
  });
});
