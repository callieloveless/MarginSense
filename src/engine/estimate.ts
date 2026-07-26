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
import { signalAbsolute, type AbsoluteSignal } from "./signal";

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

/**
 * Allocate a `total` across weighted lines, exact to the cent: each line gets
 * `round(total × weight / Σweight)`, and the rounding remainder is placed on the largest-weight
 * line (ties → earliest) so the parts sum to `total` exactly. When every weight is zero (nothing
 * to allocate) all parts are zero. This is the **one** allocation method in the codebase — the
 * per-line price baseline, the per-line overhead share, and the per-line contingency share all
 * use it, and the client-document projection delegates to it (constitution §3.4a).
 */
export function allocateByWeight(total: Cents, weights: readonly number[]): Cents[] {
  const n = weights.length;
  const out: Cents[] = new Array<Cents>(n).fill(0);
  let sumW = 0;
  for (const w of weights) sumW += w;
  if (sumW <= 0) {
    // No proportional basis (every weight is zero). Split `total` equally so the parts still sum
    // to it — never silently drop the total — with the remainder on the first line.
    if (n === 0 || total === 0) return out;
    const each = roundHalfUp(total / n);
    for (let i = 0; i < n; i++) out[i] = each;
    const remainder = total - each * n;
    if (remainder !== 0) out[0]! += remainder;
    return out;
  }

  let allocated = 0;
  let largest = 0;
  for (let i = 0; i < n; i++) {
    out[i] = roundHalfUp((total * weights[i]!) / sumW);
    allocated += out[i]!;
    if (weights[i]! > weights[largest]!) largest = i;
  }
  const remainder = total - allocated;
  if (remainder !== 0) out[largest]! += remainder;
  return out;
}

/** One line's full profit decomposition, for the per-line signal (constitution §3.4a). */
export interface LineBreakdown {
  readonly category: LineCategory;
  /** Effective price: the entered price, else the cost-proportional derived baseline. */
  readonly price: Cents;
  readonly directCost: Cents;
  readonly overheadAllocated: Cents;
  readonly contingencyShare: Cents;
  readonly net: Cents;
  readonly laborHours: number;
  /** `net / laborHours` — labor lines only; not-applicable for non-labor or zero-hour lines. */
  readonly profitPerHour: Computed<CentsPerHour>;
  /** The red/yellow/green signal on the same thresholds — labor lines only. */
  readonly signal: Computed<AbsoluteSignal>;
}

/** Inputs to decompose an estimate into per-line breakdowns. */
export interface LineBreakdownsInput {
  readonly lines: readonly LineItem[];
  /** Effective price per line (entered or baseline), aligned to `lines`. */
  readonly prices: readonly Cents[];
  readonly burdenedLaborRate: CentsPerHour;
  /** The estimate's total overhead and contingency, split across lines so shares sum exactly. */
  readonly overheadAllocated: Cents;
  readonly contingency: Cents;
  /** For the per-line signal; when not-applicable, per-line signals are not-applicable. */
  readonly targetProfitPerHour: Computed<CentsPerHour>;
}

/**
 * Decompose an estimate into per-line net + per-line profit-per-hour signal (constitution §3.4a).
 * Overhead follows labor hours and contingency follows the contingency base (cost + overhead);
 * both are allocated with {@link allocateByWeight} so the per-line shares sum **exactly** to the
 * estimate's `overheadAllocated` and `contingency` — which makes `Σ line.net === netProfit`.
 * Non-labor and zero-hour lines get a not-applicable per-hour signal.
 */
export function lineBreakdowns(
  input: LineBreakdownsInput,
  config: EngineConfig = DEFAULT_CONFIG,
): LineBreakdown[] {
  const { lines, prices, burdenedLaborRate, overheadAllocated, contingency, targetProfitPerHour } =
    input;

  const costs = lines.map((line) => lineCost(line, burdenedLaborRate));
  const hours = lines.map((line) => lineLaborHours(line));
  const overheadShares = allocateByWeight(overheadAllocated, hours);
  const contingencyWeights = costs.map((cost, i) => cost + overheadShares[i]!);
  const contingencyShares = allocateByWeight(contingency, contingencyWeights);

  return lines.map((line, i) => {
    const price = prices[i] ?? 0;
    const directCost = costs[i]!;
    const overhead = overheadShares[i]!;
    const contingencyShare = contingencyShares[i]!;
    const net = price - directCost - overhead - contingencyShare;
    const laborHours = hours[i]!;

    const profitPerHour: Computed<CentsPerHour> =
      isLaborLine(line) && laborHours > 0
        ? { ok: true, value: roundHalfUp(net / laborHours) }
        : notApplicable(isLaborLine(line) ? "no labor hours" : "not a labor line");
    const signal: Computed<AbsoluteSignal> = profitPerHour.ok
      ? signalAbsolute(profitPerHour, targetProfitPerHour, config)
      : notApplicable(profitPerHour.reason);

    return {
      category: line.category,
      price,
      directCost,
      overheadAllocated: overhead,
      contingencyShare,
      net,
      laborHours,
      profitPerHour,
      signal,
    };
  });
}
