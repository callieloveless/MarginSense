/**
 * Estimate-module tests (add-estimate-dashboard). Prove that costs entered → price solved to
 * the target margin by the engine, that a total-price override makes margin an outcome, and
 * that the module never invents math (every number traces to the engine). Uses the reference
 * business rates ($50/hr recovery, $43.75/hr burdened).
 */

import { describe, expect, it } from "vitest";
import { computeEstimate, toEngineLine, activeVersion, type StoredEstimate } from "./estimate";

const RATES = { overheadRecoveryRate: 5000, burdenedLaborRate: 4375 } as const;

/** A clean job: 8 labor hours + $50 of material, 45% target margin, 10% contingency. */
const JOB: StoredEstimate = {
  targetMarginBp: 4500,
  contingencyBp: 1000,
  lines: [
    { category: "labor", laborMinutes: 480 },
    { category: "material", quantity: 4, unitCostCents: 1250 },
  ],
};

describe("toEngineLine", () => {
  it("maps labor and non-labor lines to the engine shape", () => {
    expect(toEngineLine({ category: "labor", laborMinutes: 480 })).toEqual({
      category: "labor",
      laborMinutes: 480,
    });
    expect(toEngineLine({ category: "material", quantity: 4, unitCostCents: 1250 })).toEqual({
      category: "material",
      quantity: 4,
      unitCostCents: 1250,
    });
  });

  it("carries a per-line price override when present", () => {
    expect(toEngineLine({ category: "labor", laborMinutes: 60, priceCents: 9999 })).toEqual({
      category: "labor",
      laborMinutes: 60,
      price: 9999,
    });
  });
});

describe("computeEstimate — margin-solve by default", () => {
  it("solves the price so net margin hits the target", () => {
    const result = computeEstimate(JOB, RATES);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { rollUp, price, priceSource, directCost, laborHours } = result.value;

    expect(priceSource).toBe("solved");
    expect(directCost).toBe(40_000); // 8h × $43.75 + 4 × $12.50 = $350 + $50
    expect(laborHours).toBe(8);
    expect(rollUp.overheadAllocated).toBe(40_000); // 8h × $50/hr
    expect(rollUp.contingency).toBe(8_000); // 10% of (40k + 40k)
    expect(price).toBe(160_000); // $88 total cost ÷ (1 − 0.45)
    expect(rollUp.netProfit).toBe(72_000);
    expect(rollUp.netMargin.ok && rollUp.netMargin.value).toBe(4_500);
    expect(rollUp.eph.ok && rollUp.eph.value).toBe(9_000); // $90/hr
  });

  it("returns not-applicable when the target margin is unreachable (≥100%)", () => {
    const result = computeEstimate({ ...JOB, targetMarginBp: 10_000 }, RATES);
    expect(result.ok).toBe(false);
  });
});

describe("computeEstimate — total-price override", () => {
  it("makes margin an outcome instead of re-solving", () => {
    const result = computeEstimate({ ...JOB, totalPriceOverrideCents: 150_000 }, RATES);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.priceSource).toBe("override");
    expect(result.value.price).toBe(150_000);
    expect(result.value.rollUp.netProfit).toBe(62_000); // 150k − 88k total cost
    expect(result.value.rollUp.eph.ok && result.value.rollUp.eph.value).toBe(7_750);
  });
});

describe("computeEstimate — per-line breakdown & signal (§3.4a)", () => {
  const RATES_WITH_TARGET = { ...RATES, targetProfitPerHour: { ok: true, value: 8_750 } } as const;

  it("returns a per-line breakdown whose nets reconcile to the estimate net", () => {
    const result = computeEstimate(JOB, RATES_WITH_TARGET);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { lines, rollUp } = result.value;
    expect(lines).toHaveLength(2);
    expect(lines.reduce((a, l) => a + l.net, 0)).toBe(rollUp.netProfit); // 72,000
  });

  it("colours labor lines and leaves non-labor lines without a per-hour signal", () => {
    const result = computeEstimate(JOB, RATES_WITH_TARGET);
    if (!result.ok) return;
    const [labor, material] = result.value.lines;
    // 8h labor priced at its $1,400 cost-share → ~$71.88/hr vs $87.50 target → yellow.
    expect(labor!.signal.ok && labor!.signal.value.color).toBe("yellow");
    expect(material!.signal.ok).toBe(false);
  });

  it("omitting the target leaves per-line signals not-applicable", () => {
    const result = computeEstimate(JOB, RATES); // no targetProfitPerHour
    if (!result.ok) return;
    expect(result.value.lines[0]!.signal.ok).toBe(false);
  });
});

describe("computeEstimate — entered per-line prices (§3.4a)", () => {
  const pricedLabor: StoredEstimate = {
    targetMarginBp: 4_500,
    contingencyBp: 1_000,
    lines: [
      { category: "labor", laborMinutes: 480, priceCents: 200_000 }, // entered
      { category: "material", quantity: 4, unitCostCents: 1_250 }, // baseline
    ],
  };

  it("uses the entered price, baselines the rest, and makes revenue their sum (margin an outcome)", () => {
    const result = computeEstimate(pricedLabor, RATES);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // solved baseline total is $1,600; unpriced material baselines to $200; labor entered $2,000.
    expect(result.value.priceSource).toBe("line");
    expect(result.value.price).toBe(220_000);
    expect(result.value.rollUp.revenue).toBe(220_000);
  });

  it("an entered line price supersedes a total-price override (override not applied)", () => {
    const result = computeEstimate({ ...pricedLabor, totalPriceOverrideCents: 500_000 }, RATES);
    if (!result.ok) return;
    expect(result.value.priceSource).toBe("line");
    expect(result.value.price).toBe(220_000); // the $5,000 override is ignored
  });

  it("per-line nets reconcile to netProfit with mixed entered/unpriced lines", () => {
    const result = computeEstimate(pricedLabor, RATES);
    if (!result.ok) return;
    const sumNet = result.value.lines.reduce((a, l) => a + l.net, 0);
    expect(sumNet).toBe(result.value.rollUp.netProfit);
  });

  it("a fully line-priced estimate computes even when the margin is unreachable (no solve needed)", () => {
    const fully: StoredEstimate = {
      targetMarginBp: 10_000, // 100% — the margin-solve would be not-applicable
      contingencyBp: 1_000,
      lines: [
        { category: "labor", laborMinutes: 480, priceCents: 200_000 },
        { category: "material", quantity: 4, unitCostCents: 1_250, priceCents: 30_000 },
      ],
    };
    const result = computeEstimate(fully, RATES);
    expect(result.ok).toBe(true); // not NA — every line is priced, no solve is needed
    if (!result.ok) return;
    expect(result.value.priceSource).toBe("line");
    expect(result.value.price).toBe(230_000); // Σ entered prices
  });
});

describe("computeEstimate — a zero-cost estimate keeps its total (§3.4a allocation)", () => {
  it("a total override on all-zero-cost lines still yields that revenue, not 0", () => {
    const est: StoredEstimate = {
      targetMarginBp: 4_500,
      contingencyBp: 1_000,
      totalPriceOverrideCents: 100_000,
      lines: [
        { category: "material", quantity: 0, unitCostCents: 0 },
        { category: "material", quantity: 0, unitCostCents: 0 },
      ],
    };
    const result = computeEstimate(est, RATES);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.price).toBe(100_000); // not silently dropped to 0
    expect(result.value.rollUp.revenue).toBe(100_000);
  });
});

describe("computeEstimate — derived prices are never stored", () => {
  it("does not mutate the estimate's lines when solving baselines", () => {
    const est: StoredEstimate = {
      targetMarginBp: 4_500,
      contingencyBp: 1_000,
      lines: [{ category: "labor", laborMinutes: 480 }],
    };
    computeEstimate(est, RATES);
    expect(est.lines[0]!.priceCents).toBeUndefined(); // baseline was derived, not written
  });

  it("re-solves when a cost changes (nothing is frozen)", () => {
    const a = computeEstimate(JOB, RATES);
    const b = computeEstimate(
      { ...JOB, lines: [{ category: "labor", laborMinutes: 960 }, JOB.lines[1]!] },
      RATES,
    );
    if (!a.ok || !b.ok) return;
    expect(b.value.price).not.toBe(a.value.price); // more labor → different solved price
  });
});

describe("activeVersion", () => {
  it("returns the active version or null", () => {
    const versions = [
      { id: "a", isActive: false },
      { id: "b", isActive: true },
    ];
    expect(activeVersion(versions)?.id).toBe("b");
    expect(activeVersion([{ id: "a", isActive: false }])).toBeNull();
  });
});
