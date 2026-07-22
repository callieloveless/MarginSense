/**
 * Estimate roll-up, contingency, EPH, and margin-solve pricing (constitution §3.4).
 *
 * This is where line items become the numbers the whole product is oriented around:
 * `netProfit` and the crown-jewel **EPH = netProfit / laborHours**. Costs are entered and
 * price is solved to hit the target margin by default; a user override flips price to
 * entered and margin becomes an outcome. Overhead enters a job in exactly one place —
 * `overheadAllocated = laborHours × overheadRecoveryRate`. Contingency is a real reserved
 * cost that reduces net profit.
 */

import type {
  BasisPoints,
  Cents,
  CentsPerHour,
  Computed,
  Minutes,
} from "./money";
import {
  applyBp,
  notApplicable,
  ratioToBp,
  roundHalfUp,
  sumCents,
} from "./money";
import type { EngineConfig } from "./config";
import { contingencyBaseAmount, DEFAULT_CONFIG } from "./config";

/** Granular line categories (§3.4). Any grouping (e.g. "subs / equip / permits") is display. */
export type LineCategory =
  | "labor"
  | "material"
  | "subcontractor"
  | "equipment"
  | "permit"
  | "disposal"
  | "other";

/** A labor line: cost comes from minutes × the burdened rate. */
export interface LaborLine {
  readonly category: "labor";
  readonly laborMinutes: Minutes;
  /** What the client pays for this line (may be solved or overridden). */
  readonly price?: Cents;
}

/** A non-labor line: cost comes from quantity × unit cost. */
export interface NonLaborLine {
  readonly category: Exclude<LineCategory, "labor">;
  readonly quantity: number;
  readonly unitCostCents: Cents;
  readonly price?: Cents;
}

export type LineItem = LaborLine | NonLaborLine;

/** The estimate roll-up. Money is integer cents; margins are bp; ratios that divide are NA-safe. */
export interface EstimateRollUp {
  readonly revenue: Cents;
  readonly directCost: Cents;
  readonly laborHours: number;
  readonly overheadAllocated: Cents;
  readonly contingency: Cents;
  readonly netProfit: Cents;
  /** `(revenue − directCost) / revenue` in basis points; not-applicable at zero revenue. */
  readonly grossMargin: Computed<BasisPoints>;
  /** `netProfit / revenue` in basis points; not-applicable at zero revenue. */
  readonly netMargin: Computed<BasisPoints>;
  /** Effective Profit per Hour = `netProfit / laborHours`; not-applicable at zero hours. */
  readonly eph: Computed<CentsPerHour>;
}

/** Type guard for labor lines. */
export function isLaborLine(line: LineItem): line is LaborLine {
  return line.category === "labor";
}

/** Labor hours a line contributes (`minutes / 60`); non-labor lines contribute zero hours. */
export function lineLaborHours(line: LineItem): number {
  return isLaborLine(line) ? line.laborMinutes / 60 : 0;
}

/**
 * The internal cost of a line, rounded to whole cents: labor as `minutes/60 × burdenedRate`,
 * non-labor as `quantity × unitCost`.
 */
export function lineCost(line: LineItem, burdenedLaborRate: CentsPerHour): Cents {
  if (isLaborLine(line)) {
    return roundHalfUp((line.laborMinutes / 60) * burdenedLaborRate);
  }
  return roundHalfUp(line.quantity * line.unitCostCents);
}

/** The client-facing price of a line (0 when not yet priced). */
export function linePrice(line: LineItem): Cents {
  return line.price ?? 0;
}

/** Aggregate inputs to the roll-up (revenue/costs already summed, e.g. from an override). */
export interface RollUpTotalsInput {
  readonly revenue: Cents;
  readonly directCost: Cents;
  readonly laborHours: number;
  readonly overheadRecoveryRate: CentsPerHour;
  readonly contingencyBp: BasisPoints;
}

/**
 * Roll aggregate totals into the estimate figures. This is also the **price-override path**:
 * given an entered `revenue`, `netMargin` is recomputed as an outcome rather than solved.
 */
export function rollUpTotals(
  input: RollUpTotalsInput,
  config: EngineConfig = DEFAULT_CONFIG,
): EstimateRollUp {
  const { revenue, directCost, laborHours, overheadRecoveryRate, contingencyBp } =
    input;

  const overheadAllocated = roundHalfUp(laborHours * overheadRecoveryRate);
  const contingencyBase = contingencyBaseAmount(
    config.contingencyBase,
    directCost,
    overheadAllocated,
  );
  const contingency = applyBp(contingencyBase, contingencyBp);
  const netProfit = revenue - directCost - overheadAllocated - contingency;

  const grossMargin: Computed<BasisPoints> =
    revenue === 0
      ? notApplicable("no revenue")
      : { ok: true, value: ratioToBp((revenue - directCost) / revenue) };
  const netMargin: Computed<BasisPoints> =
    revenue === 0
      ? notApplicable("no revenue")
      : { ok: true, value: ratioToBp(netProfit / revenue) };
  const eph: Computed<CentsPerHour> =
    laborHours === 0
      ? notApplicable("no labor hours")
      : { ok: true, value: roundHalfUp(netProfit / laborHours) };

  return {
    revenue,
    directCost,
    laborHours,
    overheadAllocated,
    contingency,
    netProfit,
    grossMargin,
    netMargin,
    eph,
  };
}

/** Line-based inputs to the roll-up. */
export interface RollUpEstimateInput {
  readonly lines: readonly LineItem[];
  readonly overheadRecoveryRate: CentsPerHour;
  readonly burdenedLaborRate: CentsPerHour;
  readonly contingencyBp: BasisPoints;
}

/**
 * Roll a set of line items up into the estimate figures: sums `revenue` (Σ price),
 * `directCost` (Σ cost), and `laborHours` (Σ labor hours), then delegates to
 * {@link rollUpTotals}.
 */
export function rollUpEstimate(
  input: RollUpEstimateInput,
  config: EngineConfig = DEFAULT_CONFIG,
): EstimateRollUp {
  const { lines, overheadRecoveryRate, burdenedLaborRate, contingencyBp } = input;

  const revenue = sumCents(lines.map(linePrice));
  const directCost = sumCents(lines.map((line) => lineCost(line, burdenedLaborRate)));
  let laborHours = 0;
  for (const line of lines) laborHours += lineLaborHours(line);

  return rollUpTotals(
    { revenue, directCost, laborHours, overheadRecoveryRate, contingencyBp },
    config,
  );
}

/** Inputs to solve a target-margin price (costs entered, price is the outcome). */
export interface SolvePriceInput {
  readonly directCost: Cents;
  readonly laborHours: number;
  readonly overheadRecoveryRate: CentsPerHour;
  readonly contingencyBp: BasisPoints;
  readonly targetMarginBp: BasisPoints;
}

/** A solved price together with the roll-up recomputed at that whole-cent price. */
export interface SolvedPrice {
  readonly price: Cents;
  readonly rollUp: EstimateRollUp;
}

/**
 * Solve the estimate's total price so `netMargin` equals `target_margin_bp`. Because every
 * cost (directCost, overheadAllocated, contingency) is independent of price, the solve is
 * closed-form: `revenue = totalCost / (1 − targetMargin)`, rounded to whole cents, and
 * margin absorbs the sub-cent remainder. Returns not-applicable for an unreachable margin
 * (≥ 100%).
 */
export function solvePriceForMargin(
  input: SolvePriceInput,
  config: EngineConfig = DEFAULT_CONFIG,
): Computed<SolvedPrice> {
  const { directCost, laborHours, overheadRecoveryRate, contingencyBp, targetMarginBp } =
    input;

  const targetRatio = targetMarginBp / 10_000;
  if (targetRatio >= 1) {
    return notApplicable("target margin must be below 100%");
  }

  const overheadAllocated = roundHalfUp(laborHours * overheadRecoveryRate);
  const contingencyBase = contingencyBaseAmount(
    config.contingencyBase,
    directCost,
    overheadAllocated,
  );
  const contingency = applyBp(contingencyBase, contingencyBp);
  const totalCost = directCost + overheadAllocated + contingency;

  const price = roundHalfUp(totalCost / (1 - targetRatio));
  const rollUp = rollUpTotals(
    { revenue: price, directCost, laborHours, overheadRecoveryRate, contingencyBp },
    config,
  );

  return { ok: true, value: { price, rollUp } };
}
