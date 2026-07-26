/**
 * The estimate preview DTO (revamp-estimate-editor): the mapper must equal the engine's numbers and,
 * critically, emit a per-line signal ONLY where it is real — an entered-price labor line — never on a
 * baseline-allocated line (which is uniform by construction). Plus the markup helper's boundaries.
 */

import { describe, expect, it } from "vitest";
import { computeEstimate, type BusinessRatesInput, type StoredEstimate } from "@/src/estimate";
import { estimateComputationToDTO, markupBasisPoints } from "./estimate-dto";

const TARGET = { ok: true, value: 4_000 } as const; // $40/hr target profit-per-hour
const RATES: BusinessRatesInput = {
  overheadRecoveryRate: 1_000, // $10/hr overhead recovery
  burdenedLaborRate: 5_000, // $50/hr burdened labor cost
  targetProfitPerHour: TARGET,
};

describe("markupBasisPoints", () => {
  it("is (price − cost) / cost in basis points", () => {
    const m = markupBasisPoints(12_000, 10_000);
    expect(m.ok && m.value).toBe(2_000); // +20%
  });

  it("is negative when price is below cost", () => {
    const m = markupBasisPoints(8_000, 10_000);
    expect(m.ok && m.value).toBe(-2_000); // −20%
  });

  it("is not-applicable at zero cost (no divide-by-zero, no fabricated %)", () => {
    expect(markupBasisPoints(10_000, 0).ok).toBe(false);
  });
});

describe("estimateComputationToDTO", () => {
  // One entered-price labor line, one baseline labor line, one material line.
  const est: StoredEstimate = {
    targetMarginBp: 4_500,
    contingencyBp: 500,
    totalPriceOverrideCents: null,
    lines: [
      { category: "labor", laborMinutes: 600, priceCents: 60_000 }, // entered price, 10h
      { category: "labor", laborMinutes: 300 }, // baseline, 5h
      { category: "material", quantity: 4, unitCostCents: 1_250 }, // material
    ],
  };
  const computed = computeEstimate(est, RATES);
  if (!computed.ok) throw new Error(`fixture didn't price: ${computed.reason}`);
  const dto = estimateComputationToDTO(computed.value, [true, false, false], TARGET);

  it("carries the estimate roll-up numbers from the engine", () => {
    expect(dto.priceCents).toBe(computed.value.rollUp.revenue);
    expect(dto.directCostCents).toBe(computed.value.rollUp.directCost);
    expect(dto.netProfitCents).toBe(computed.value.rollUp.netProfit);
    expect(dto.priceSource).toBe("line"); // an entered price supersedes the solve
    expect(dto.targetEphCents).toBe(4_000);
  });

  it("shows a per-line signal ONLY on the entered-price labor line", () => {
    expect(dto.lines[0]!.priced).toBe(true);
    expect(dto.lines[0]!.signalColor).not.toBeNull(); // entered price + labor → real signal
    expect(dto.lines[0]!.ephCents).not.toBeNull();
  });

  it("shows NO per-line colour on a baseline (unpriced) labor line — it is uniform by construction", () => {
    expect(dto.lines[1]!.priced).toBe(false);
    expect(dto.lines[1]!.signalColor).toBeNull();
    expect(dto.lines[1]!.ephCents).toBeNull();
  });

  it("shows no profit-per-hour signal on a non-labor line", () => {
    expect(dto.lines[2]!.category).toBe("material");
    expect(dto.lines[2]!.signalColor).toBeNull();
    expect(dto.lines[2]!.ephCents).toBeNull();
  });

  it("maps each line's price/cost/net straight from the engine breakdown", () => {
    dto.lines.forEach((line, i) => {
      const lb = computed.value.lines[i]!;
      expect(line.priceCents).toBe(lb.price);
      expect(line.costCents).toBe(lb.directCost);
      expect(line.netCents).toBe(lb.net);
    });
  });

  it("computes the entered labor line's markup from its price and cost", () => {
    // cost = 10h × $50/hr = $500.00; price $600.00 → markup (600−500)/500 = +20%.
    expect(dto.lines[0]!.costCents).toBe(50_000);
    expect(dto.lines[0]!.markupBp).toBe(2_000);
  });
});
