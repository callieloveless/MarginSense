import { describe, it, expect } from "vitest";
import {
  addCents,
  applyBp,
  bpToRatio,
  defined,
  formatCents,
  isApplicable,
  multiplyCents,
  notApplicable,
  ratioToBp,
  roundHalfUp,
  safeDivide,
  subtractCents,
  sumCents,
  valueOr,
} from "./money.js";

describe("integer cents arithmetic", () => {
  it("adds cents with no floating-point drift (spec scenario)", () => {
    expect(addCents(1049, 2)).toBe(1051);
  });

  it("sums a list exactly", () => {
    expect(sumCents([1237000, 320000, 77850])).toBe(1634850);
    expect(sumCents([])).toBe(0);
  });

  it("subtracts cents", () => {
    expect(subtractCents(2972500, 1237000)).toBe(1735500);
  });

  it("multiplies cents by a fractional factor and rounds to whole cents", () => {
    // 90 minutes = 1.5 hours at 6000 ¢/hr → 9000 ¢
    expect(multiplyCents(6000, 90 / 60)).toBe(9000);
    // 64 hours at 5000 ¢/hr → 320000 ¢
    expect(multiplyCents(5000, 64)).toBe(320000);
  });
});

describe("half-up rounding boundaries", () => {
  it("rounds a half toward the larger value", () => {
    expect(roundHalfUp(0.5)).toBe(1);
    expect(roundHalfUp(2.5)).toBe(3);
    expect(roundHalfUp(2.49999)).toBe(2);
  });

  it("absorbs tiny float error back to the exact integer", () => {
    expect(roundHalfUp(77849.99999999)).toBe(77850);
  });
});

describe("basis-point conversions", () => {
  it("converts bp to a decimal ratio without ambiguity (spec scenario)", () => {
    expect(bpToRatio(1500)).toBeCloseTo(0.15, 10);
    expect(bpToRatio(4500)).toBeCloseTo(0.45, 10);
  });

  it("converts a ratio back to bp, rounded", () => {
    expect(ratioToBp(0.15)).toBe(1500);
    expect(ratioToBp(0.4500084)).toBe(4500);
  });

  it("applies a bp rate to cents with an exact integer product (contingency base)", () => {
    // 5% contingency on 1,557,000 ¢ = 77,850 ¢
    expect(applyBp(1237000 + 320000, 500)).toBe(77850);
    expect(applyBp(0, 500)).toBe(0);
  });
});

describe("formatCents (display only)", () => {
  it("formats with thousands separators and two decimals (spec scenario)", () => {
    expect(formatCents(123456)).toBe("$1,234.56");
  });

  it("does not mutate the underlying value", () => {
    const cents = 123456;
    formatCents(cents);
    expect(cents).toBe(123456);
  });

  it("handles sub-dollar, zero, and large values", () => {
    expect(formatCents(5)).toBe("$0.05");
    expect(formatCents(0)).toBe("$0.00");
    expect(formatCents(100)).toBe("$1.00");
    expect(formatCents(1000000000)).toBe("$10,000,000.00");
  });

  it("renders negatives with a leading minus", () => {
    expect(formatCents(-123456)).toBe("-$1,234.56");
    expect(formatCents(-5)).toBe("-$0.05");
  });
});

describe("safe division / not-applicable", () => {
  it("divides normally when the denominator is non-zero", () => {
    const r = safeDivide(1800000, 40);
    expect(isApplicable(r)).toBe(true);
    expect(valueOr(r, -1)).toBe(45000);
  });

  it("returns not-applicable on a zero denominator instead of dividing", () => {
    const r = safeDivide(1000, 0);
    expect(isApplicable(r)).toBe(false);
    expect(valueOr(r, -1)).toBe(-1);
    if (!r.ok) expect(r.reason).toMatch(/zero/);
  });

  it("wraps defined and not-applicable results", () => {
    expect(defined(42)).toEqual({ ok: true, value: 42 });
    const na = notApplicable<number>("no hours");
    expect(na.ok).toBe(false);
    if (!na.ok) expect(na.reason).toBe("no hours");
  });
});
