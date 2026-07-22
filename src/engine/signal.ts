/**
 * The "pull-their-weight" red/yellow/green signal (constitution §3.5). Two complementary
 * views share the same thresholds:
 *
 * - **Absolute** — a single estimate vs the business target: `ratio = EPH / targetProfitPerHour`.
 * - **Comparative** — a job's fair share within the book of work: `weight = profitShare /
 *   hourShare`, plus the concrete `percentOfYear` and `percentOfProfitGoal` figures.
 *
 * Every result carries the inputs that produced it, so the UI can show the math behind any
 * color (§6.6). Colors are always paired with text in the UI — never color alone.
 */

import type { Cents, CentsPerHour, Computed, Ratio } from "./money";
import { notApplicable, safeDivide } from "./money";
import type { EngineConfig, SignalThresholds } from "./config";
import { DEFAULT_CONFIG } from "./config";

/** The three signal colors. Never rendered without accompanying text (§3.5). */
export type SignalColor = "green" | "yellow" | "red";

/**
 * Classify a score (a `ratio` or a `weight`) into a color: `≥ green` is green, `≥ yellow`
 * (and below green) is yellow, anything lower is red. Defaults: 1.00 / 0.80.
 */
export function classify(score: Ratio, thresholds: SignalThresholds): SignalColor {
  if (score >= thresholds.green) return "green";
  if (score >= thresholds.yellow) return "yellow";
  return "red";
}

/** Absolute-view result: the color plus the inputs behind it. */
export interface AbsoluteSignal {
  readonly color: SignalColor;
  readonly eph: CentsPerHour;
  readonly targetProfitPerHour: CentsPerHour;
  readonly ratio: Ratio;
}

/**
 * Classify a single estimate against the business target. Not-applicable when EPH or the
 * target is undefined (e.g. no labor hours, no billable capacity) or the target is zero.
 * A negative EPH (a job that loses money) yields a negative ratio → red.
 */
export function signalAbsolute(
  eph: Computed<CentsPerHour>,
  targetProfitPerHour: Computed<CentsPerHour>,
  config: EngineConfig = DEFAULT_CONFIG,
): Computed<AbsoluteSignal> {
  if (!eph.ok) return notApplicable(eph.reason);
  if (!targetProfitPerHour.ok) return notApplicable(targetProfitPerHour.reason);

  const ratioResult = safeDivide(
    eph.value,
    targetProfitPerHour.value,
    "target profit per hour is zero",
  );
  if (!ratioResult.ok) return notApplicable(ratioResult.reason);

  return {
    ok: true,
    value: {
      color: classify(ratioResult.value, config.thresholds),
      eph: eph.value,
      targetProfitPerHour: targetProfitPerHour.value,
      ratio: ratioResult.value,
    },
  };
}

/** Inputs for the comparative/portfolio view of one job within a set. */
export interface ComparativeInput {
  /** This job's labor hours (its "hours" share numerator). */
  readonly laborHours: number;
  /** This job's net profit (its "profit" share numerator). */
  readonly netProfit: Cents;
  /** Overhead allocated to this job (for the gross-profit contribution). */
  readonly overheadAllocated: Cents;
  /** Total labor hours across the whole book of work. */
  readonly totalHours: number;
  /** Total net profit across the whole book of work. */
  readonly totalProfit: Cents;
  /** The business's annual billable hours (for `percentOfYear`). */
  readonly annualBillableHours: number;
  /** The business's annual gross-profit goal (for `percentOfProfitGoal`). */
  readonly grossProfitGoal: Cents;
}

/** Comparative-view result: the color plus every input behind it, including the two figures. */
export interface ComparativeSignal {
  readonly color: SignalColor;
  readonly hourShare: Ratio;
  readonly profitShare: Ratio;
  readonly weight: Ratio;
  /** `laborHours / annualBillableHours` — share of the year's capacity this job consumes. */
  readonly percentOfYear: Computed<Ratio>;
  /** `(netProfit + overheadAllocated) / grossProfitGoal` — share of the year's profit goal. */
  readonly percentOfProfitGoal: Computed<Ratio>;
}

/**
 * The two concrete portfolio figures for a job (§3.5). `percentOfProfitGoal` uses the job's
 * gross-profit contribution (before overhead allocation), because the gross-profit goal is
 * exactly what overhead exists to fund.
 */
export function portfolioFigures(input: {
  readonly laborHours: number;
  readonly annualBillableHours: number;
  readonly netProfit: Cents;
  readonly overheadAllocated: Cents;
  readonly grossProfitGoal: Cents;
}): {
  readonly percentOfYear: Computed<Ratio>;
  readonly percentOfProfitGoal: Computed<Ratio>;
} {
  return {
    percentOfYear: safeDivide(
      input.laborHours,
      input.annualBillableHours,
      "no annual billable hours",
    ),
    percentOfProfitGoal: safeDivide(
      input.netProfit + input.overheadAllocated,
      input.grossProfitGoal,
      "no gross-profit goal",
    ),
  };
}

/**
 * Score a job's fair share within a set: `weight = profitShare / hourShare`, computed as
 * `(netProfit × totalHours) / (laborHours × totalProfit)` to avoid share-rounding artifacts.
 * Not-applicable when the set has no hours or no profit, or this job has no hours. A job that
 * returns less than its fair share of profit for the hours it eats reads red.
 */
export function signalComparative(
  input: ComparativeInput,
  config: EngineConfig = DEFAULT_CONFIG,
): Computed<ComparativeSignal> {
  if (input.totalHours === 0) return notApplicable("set has no labor hours");
  if (input.totalProfit === 0) return notApplicable("set has no net profit");
  if (input.laborHours === 0) return notApplicable("job has no labor hours");

  const hourShare = input.laborHours / input.totalHours;
  const profitShare = input.netProfit / input.totalProfit;
  const weight =
    (input.netProfit * input.totalHours) / (input.laborHours * input.totalProfit);

  const figures = portfolioFigures(input);

  return {
    ok: true,
    value: {
      color: classify(weight, config.thresholds),
      hourShare,
      profitShare,
      weight,
      percentOfYear: figures.percentOfYear,
      percentOfProfitGoal: figures.percentOfProfitGoal,
    },
  };
}
