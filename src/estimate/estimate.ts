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
  type LineBreakdown,
  type LineCategory,
  type LineItem,
  allocateByWeight,
  DEFAULT_CONFIG,
  lineBreakdowns,
  lineCost,
  lineLaborHours,
  notApplicable,
  rollUpTotals,
  solvePriceForMargin,
  sumCents,
} from "../engine/index";

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
  /** For per-line signals (§3.4a); omit to leave per-line colors not-applicable. */
  readonly targetProfitPerHour?: Computed<CentsPerHour> | undefined;
}

/**
 * How the price came to be: `solved` to the target margin, an entered `override` total, or
 * `line` when the user entered one or more per-line prices (margin becomes an outcome).
 */
export type PriceSource = "solved" | "override" | "line";

/** A computed estimate: the engine roll-up, how the price came to be, and the per-line breakdown. */
export interface EstimateComputation {
  readonly rollUp: EstimateRollUp;
  readonly priceSource: PriceSource;
  readonly price: Cents;
  readonly directCost: Cents;
  readonly laborHours: number;
  /** Per-line price + net + profit-per-hour signal (§3.4a), aligned to the estimate's lines. */
  readonly lines: LineBreakdown[];
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
  const costs = engineLines.map((l) => lineCost(l, rates.burdenedLaborRate));
  const directCost = sumCents(costs);
  let laborHours = 0;
  for (const l of engineLines) laborHours += lineLaborHours(l);

  // A price the user ENTERED on a line (null = unpriced; its baseline applies).
  const entered = est.lines.map((l) => (l.priceCents != null ? (l.priceCents as Cents) : null));
  const hasEntered = entered.some((p) => p !== null);
  const anyUnpriced = entered.some((p) => p === null);

  // How the price is determined (§3.4a): entered prices supersede a total override, which
  // supersedes the margin-solve.
  const priceSource: PriceSource = hasEntered
    ? "line"
    : est.totalPriceOverrideCents != null
      ? "override"
      : "solved";

  // The total that UNPRICED lines allocate their baselines against. A fully-priced estimate needs
  // no baseline (and no solve — so an unreachable target margin can't make it not-applicable).
  let baselineTotal: Cents;
  if (priceSource === "override") {
    baselineTotal = est.totalPriceOverrideCents as Cents;
  } else if (priceSource === "line" && !anyUnpriced) {
    baselineTotal = 0;
  } else {
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
    baselineTotal = solved.value.price;
  }

  // Effective price per line = entered, else the cost-proportional baseline. With no entered
  // price the baselines sum to `baselineTotal`, so revenue and every whole-estimate figure are
  // identical to the pre-per-line roll-up.
  const baselines = allocateByWeight(baselineTotal, costs);
  const prices: Cents[] = costs.map((_, i) => (entered[i] !== null ? entered[i]! : baselines[i]!));
  const revenue = sumCents(prices);

  const rollUp = rollUpTotals(
    {
      revenue,
      directCost,
      laborHours,
      overheadRecoveryRate: rates.overheadRecoveryRate,
      contingencyBp: est.contingencyBp,
    },
    config,
  );

  const lines = lineBreakdowns(
    {
      lines: engineLines,
      prices,
      burdenedLaborRate: rates.burdenedLaborRate,
      overheadAllocated: rollUp.overheadAllocated,
      contingency: rollUp.contingency,
      targetProfitPerHour:
        rates.targetProfitPerHour ?? notApplicable("target profit per hour not provided"),
    },
    config,
  );

  return {
    ok: true,
    value: { rollUp, priceSource, price: revenue, directCost, laborHours, lines },
  };
}

/** The active/accepted version from a set, or null if none is active. */
export function activeVersion<T extends { isActive: boolean }>(
  versions: readonly T[],
): T | null {
  return versions.find((v) => v.isActive) ?? null;
}
