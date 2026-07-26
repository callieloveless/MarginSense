import { describe, it, expect } from "vitest";
import { seedEstimatePricing } from "./estimate-seed";

const business = { targetMarginBp: 4500, defaultContingencyBp: 1000 };

describe("seedEstimatePricing (§ project-setup seed precedence)", () => {
  it("uses the project's defaults when set", () => {
    const seed = seedEstimatePricing(
      { defaultTargetMarginBp: 3000, defaultContingencyBp: 500 },
      business,
    );
    expect(seed).toEqual({ targetMarginBp: 3000, contingencyBp: 500 });
  });

  it("falls back to the business default when a project default is null", () => {
    const seed = seedEstimatePricing(
      { defaultTargetMarginBp: null, defaultContingencyBp: null },
      business,
    );
    expect(seed).toEqual({ targetMarginBp: 4500, contingencyBp: 1000 });
  });

  it("mixes: project margin, business contingency", () => {
    const seed = seedEstimatePricing(
      { defaultTargetMarginBp: 3500, defaultContingencyBp: null },
      business,
    );
    expect(seed).toEqual({ targetMarginBp: 3500, contingencyBp: 1000 });
  });

  it("treats a missing project as all business defaults (seed, not link)", () => {
    expect(seedEstimatePricing(null, business)).toEqual({
      targetMarginBp: 4500,
      contingencyBp: 1000,
    });
  });

  it("respects an explicit 0 project default (0 is a value, not 'unset')", () => {
    const seed = seedEstimatePricing(
      { defaultTargetMarginBp: 0, defaultContingencyBp: 0 },
      business,
    );
    expect(seed).toEqual({ targetMarginBp: 0, contingencyBp: 0 });
  });
});
