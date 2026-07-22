/**
 * The estimate builder's domain module (constitution §3.4, §6.8) — one of the two surfaces
 * on top of the engine. It owns line items, versions, and turning entered costs into a
 * priced roll-up, and it **only ever calls `src/engine/` for the math** — it never
 * re-derives totals, price, or margin. It also never imports `src/profit/`: the profit
 * surface reads the engine's typed roll-up this module produces, and that typed value is the
 * entire seam between them.
 */

import {
  type BasisPoints,
  type Cents,
  type CentsPerHour,
  type Computed,
  type EngineConfig,
  type EstimateRollUp,
  type LineCategory,
  type LineItem,
  DEFAULT_CONFIG,
  lineCost,
  lineLaborHours,
  notApplicable,
  rollUpTotals,
  solvePriceForMargin,
  sumCents,
} from "../engine/index.js";

/** A stored line item in the builder's shape (integer units; mirrors the DB row). */
export interface StoredLineItem {
  readonly category: LineCategory;
  readonly description?: string | null | undefined;
  readonly laborMinutes?: number | null | undefined;
  readonly quantity?: number | null | undefined;
  readonly unitCostCents?: number | null | undefined;
  readonly priceCents?: number | null | undefined;
}

/** A stored estimate: its pricing inputs and lines (costs entered; price is derived). */
export interface StoredEstimate {
  readonly targetMarginBp: BasisPoints;
  readonly contingencyBp: BasisPoints;
  /** A deliberate total-price override; null/undefined → price is margin-solved. */
  readonly totalPriceOverrideCents?: number | null | undefined;
  readonly lines: readonly StoredLineItem[];
}

/** The business's current derived rates the roll-up needs (from `src/engine/rates.ts`). */
export interface BusinessRatesInput {
  readonly overheadRecoveryRate: CentsPerHour;
  readonly burdenedLaborRate: CentsPerHour;
}

/** Whether the price was solved to the target margin or entered as an override. */
export type PriceSource = "solved" | "override";

/** A computed estimate: the engine roll-up plus how the price came to be. */
export interface EstimateComputation {
  readonly rollUp: EstimateRollUp;
  readonly priceSource: PriceSource;
  readonly price: Cents;
  readonly directCost: Cents;
  readonly laborHours: number;
}

/** Map a stored line to the engine's `LineItem` (labor vs non-labor shape). */
export function toEngineLine(line: StoredLineItem): LineItem {
  if (line.category === "labor") {
    const base = { category: "labor" as const, laborMinutes: line.laborMinutes ?? 0 };
    return line.priceCents != null ? { ...base, price: line.priceCents } : base;
  }
  const base = {
    category: line.category,
    quantity: line.quantity ?? 0,
    unitCostCents: line.unitCostCents ?? 0,
  };
  return line.priceCents != null ? { ...base, price: line.priceCents } : base;
}

/**
 * Compute an estimate's roll-up from its stored inputs and the business rates. By default
 * the engine solves the total price to `target_margin_bp`; when a total-price override is
 * present the engine is *not* re-solved and margin is recomputed as an outcome. Returns
 * not-applicable only when the solve itself is impossible (e.g. target margin ≥ 100%).
 */
export function computeEstimate(
  est: StoredEstimate,
  rates: BusinessRatesInput,
  config: EngineConfig = DEFAULT_CONFIG,
): Computed<EstimateComputation> {
  const engineLines = est.lines.map(toEngineLine);
  const directCost = sumCents(engineLines.map((l) => lineCost(l, rates.burdenedLaborRate)));
  let laborHours = 0;
  for (const l of engineLines) laborHours += lineLaborHours(l);

  if (est.totalPriceOverrideCents != null) {
    const rollUp = rollUpTotals(
      {
        revenue: est.totalPriceOverrideCents,
        directCost,
        laborHours,
        overheadRecoveryRate: rates.overheadRecoveryRate,
        contingencyBp: est.contingencyBp,
      },
      config,
    );
    return {
      ok: true,
      value: {
        rollUp,
        priceSource: "override",
        price: est.totalPriceOverrideCents,
        directCost,
        laborHours,
      },
    };
  }

  const solved = solvePriceForMargin(
    {
      directCost,
      laborHours,
      overheadRecoveryRate: rates.overheadRecoveryRate,
      contingencyBp: est.contingencyBp,
      targetMarginBp: est.targetMarginBp,
    },
    config,
  );
  if (!solved.ok) return notApplicable(solved.reason);

  return {
    ok: true,
    value: {
      rollUp: solved.value.rollUp,
      priceSource: "solved",
      price: solved.value.price,
      directCost,
      laborHours,
    },
  };
}

/** The active/accepted version from a set, or null if none is active. */
export function activeVersion<T extends { isActive: boolean }>(
  versions: readonly T[],
): T | null {
  return versions.find((v) => v.isActive) ?? null;
}
