import { describe, it, expect } from "vitest";
import {
  contingencyBaseAmount,
  DEFAULT_CONFIG,
  resolveConfig,
  targetProfitNumerator,
} from "./config";

describe("resolveConfig", () => {
  it("returns the engine defaults when nothing is overridden", () => {
    expect(resolveConfig()).toEqual(DEFAULT_CONFIG);
  });

  it("lets a business override a single threshold while keeping the other default (spec scenario)", () => {
    const cfg = resolveConfig({ thresholds: { green: 1.1 } });
    expect(cfg.thresholds.green).toBe(1.1);
    expect(cfg.thresholds.yellow).toBe(DEFAULT_CONFIG.thresholds.yellow); // 0.80 default
  });

  it("does not mutate the shared defaults", () => {
    resolveConfig({ thresholds: { green: 2.0 } });
    expect(DEFAULT_CONFIG.thresholds.green).toBe(1.0);
  });
});

describe("centralized formula & base selectors", () => {
  it("builds the target-profit numerator as income + profit", () => {
    expect(
      targetProfitNumerator("income-plus-profit-over-hours", 9000000, 1500000),
    ).toBe(10500000);
  });

  it("charges contingency against directCost + overheadAllocated", () => {
    expect(
      contingencyBaseAmount("direct-cost-plus-overhead", 1237000, 320000),
    ).toBe(1557000);
  });
});
