/**
 * Boundary-conversion tests for the onboarding input model (add-onboarding; constitution
 * §3.1). The store only ever sees integer cents/minutes/bp — these prove human dollars and
 * percentages convert exactly (half-up), that ranges are enforced with clear messages, and
 * that the reference business's inputs parse to the expected integers.
 */

import { describe, expect, it } from "vitest";
import {
  dollarsToCents,
  parseOverheadItems,
  parseSettingsForm,
  percentToBp,
} from "./validation";

describe("dollarsToCents", () => {
  it("converts plain and formatted dollar strings to integer cents", () => {
    expect(dollarsToCents("60000")).toBe(6_000_000);
    expect(dollarsToCents("$60,000")).toBe(6_000_000);
    expect(dollarsToCents("35")).toBe(3_500);
    expect(dollarsToCents("35.50")).toBe(3_550);
    expect(dollarsToCents(35)).toBe(3_500);
  });

  it("rejects negative and non-numeric input", () => {
    expect(dollarsToCents("-5")).toBeNull();
    expect(dollarsToCents("abc")).toBeNull();
    expect(dollarsToCents("")).toBeNull();
  });
});

describe("percentToBp", () => {
  it("converts percentages to integer basis points", () => {
    expect(percentToBp("45")).toBe(4_500);
    expect(percentToBp("25")).toBe(2_500);
    expect(percentToBp("12.5%")).toBe(1_250);
    expect(percentToBp(0)).toBe(0);
  });

  it("rejects negative and non-numeric input", () => {
    expect(percentToBp("-1")).toBeNull();
    expect(percentToBp("x")).toBeNull();
  });
});

/** The reference business as a human-entered form (constitution §3.2 / onboarding spec). */
const REFERENCE_FORM = {
  annualOverhead: "60000",
  ownerWage: "35",
  laborBurden: "25",
  workingDaysPerYear: "200",
  billableHoursPerDay: "6",
  incomeGoal: "90000",
  profitTarget: "15000",
  targetMargin: "45",
  defaultContingency: "10",
};

describe("parseSettingsForm", () => {
  it("parses the reference business to the expected integer units", () => {
    const result = parseSettingsForm(REFERENCE_FORM);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toEqual({
      annualOverheadCents: 6_000_000,
      ownerWageCentsPerHour: 3_500,
      laborBurdenBp: 2_500,
      workingDaysPerYear: 200,
      billableMinutesPerDay: 360,
      incomeGoalCents: 9_000_000,
      profitTargetCents: 1_500_000,
      targetMarginBp: 4_500,
      defaultContingencyBp: 1_000,
      defaultMarkupBp: null,
      defaultTaxRateBp: null,
      serviceArea: null,
    });
  });

  it("matches the spec scenario: $60k/$35/45% → 6000000 / 3500 / 4500", () => {
    const result = parseSettingsForm({ ...REFERENCE_FORM, annualOverhead: "60000", ownerWage: "35", targetMargin: "45" });
    expect(result.ok && result.data.annualOverheadCents).toBe(6_000_000);
    expect(result.ok && result.data.ownerWageCentsPerHour).toBe(3_500);
    expect(result.ok && result.data.targetMarginBp).toBe(4_500);
  });

  it("keeps advanced markup/tax optional and converts them when present", () => {
    const result = parseSettingsForm({ ...REFERENCE_FORM, defaultMarkup: "20", defaultTaxRate: "8.25" });
    expect(result.ok && result.data.defaultMarkupBp).toBe(2_000);
    expect(result.ok && result.data.defaultTaxRateBp).toBe(825);
  });

  it("stores a service area verbatim (trimmed), and treats blank as null", () => {
    const set = parseSettingsForm({ ...REFERENCE_FORM, serviceArea: "  Austin, TX  " });
    expect(set.ok && set.data.serviceArea).toBe("Austin, TX");
    const blank = parseSettingsForm({ ...REFERENCE_FORM, serviceArea: "   " });
    expect(blank.ok && blank.data.serviceArea).toBeNull();
    const absent = parseSettingsForm(REFERENCE_FORM);
    expect(absent.ok && absent.data.serviceArea).toBeNull();
  });

  it("rejects a target margin of 100% or more (margin is profit/price)", () => {
    const result = parseSettingsForm({ ...REFERENCE_FORM, targetMargin: "100" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/margin/i);
  });

  it("rejects out-of-range working days with a clear message", () => {
    const result = parseSettingsForm({ ...REFERENCE_FORM, workingDaysPerYear: "400" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/working days/i);
  });

  it("rejects a missing required field", () => {
    const { annualOverhead, ...rest } = REFERENCE_FORM;
    void annualOverhead;
    expect(parseSettingsForm(rest).ok).toBe(false);
  });
});

describe("parseOverheadItems", () => {
  it("converts dollar amounts to cents and defaults category to null", () => {
    const result = parseOverheadItems([
      { name: "Insurance", amount: "1200" },
      { name: "Truck", amount: "$900.50", category: "vehicle" },
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toEqual([
      { name: "Insurance", amountCents: 120_000, category: null },
      { name: "Truck", amountCents: 90_050, category: "vehicle" },
    ]);
  });

  it("treats no items as a valid empty list", () => {
    expect(parseOverheadItems(undefined)).toEqual({ ok: true, data: [] });
    expect(parseOverheadItems([])).toEqual({ ok: true, data: [] });
  });

  it("rejects an item with a negative amount", () => {
    expect(parseOverheadItems([{ name: "Bad", amount: "-5" }]).ok).toBe(false);
  });
});
