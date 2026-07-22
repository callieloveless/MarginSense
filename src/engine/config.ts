/**
 * Engine configuration — the single home for every tunable value in the profit math
 * (constitution §6, techstack §6: "no magic constants scattered around"). Thresholds, the
 * target-profit-per-hour formula, the contingency base, and the rounding rule all live here;
 * nothing downstream hardcodes them. Callers pass a per-business config (built from stored
 * settings) via {@link resolveConfig}; the defaults are the fallback, never mutated.
 */

import type { Cents, Ratio } from "./money";
import { roundHalfUp } from "./money";

/**
 * Red/yellow/green cutoffs, applied to `ratio` (absolute view) or `weight` (comparative
 * view). A score `≥ green` is green, `≥ yellow` (and `< green`) is yellow, below `yellow` is
 * red. Defaults: green ≥ 1.00, yellow 0.80–0.99, red < 0.80 (constitution §3.5).
 */
export interface SignalThresholds {
  readonly green: Ratio;
  readonly yellow: Ratio;
}

/**
 * How target profit per hour is built from the goals block. Only the constitution's chosen
 * formula ships in v1; the selector keeps the choice in one place and leaves room for
 * alternatives without scattering the decision (open-questions C6).
 */
export type TargetProfitFormula = "income-plus-profit-over-hours";

/**
 * What the contingency percentage is charged against. The constitution's base is the job's
 * full internal cost before profit: `directCost + overheadAllocated` (open-questions D2).
 */
export type ContingencyBase = "direct-cost-plus-overhead";

/** Display rounding rule. Half-up is the single documented rule (constitution §3.1). */
export type RoundingMode = "half-up";

/** The full engine configuration for one business. */
export interface EngineConfig {
  readonly thresholds: SignalThresholds;
  readonly targetProfitFormula: TargetProfitFormula;
  readonly contingencyBase: ContingencyBase;
  readonly rounding: RoundingMode;
}

/** Engine defaults (constitution §3.5 thresholds; §3.3/§3.4 formula & base choices). */
export const DEFAULT_CONFIG: EngineConfig = {
  thresholds: { green: 1.0, yellow: 0.8 },
  targetProfitFormula: "income-plus-profit-over-hours",
  contingencyBase: "direct-cost-plus-overhead",
  rounding: "half-up",
};

/** A per-business override: any subset of config, with nested thresholds partially settable. */
export interface EngineConfigOverrides {
  readonly thresholds?: Partial<SignalThresholds>;
  readonly targetProfitFormula?: TargetProfitFormula;
  readonly contingencyBase?: ContingencyBase;
  readonly rounding?: RoundingMode;
}

/**
 * Merge per-business overrides onto the engine defaults, returning a fresh config. Partial
 * threshold overrides keep the un-supplied default (e.g. a business that raises only `green`
 * to 1.10 still gets the default `yellow` 0.80). The shared defaults are never mutated.
 */
export function resolveConfig(overrides: EngineConfigOverrides = {}): EngineConfig {
  return {
    thresholds: {
      green: overrides.thresholds?.green ?? DEFAULT_CONFIG.thresholds.green,
      yellow: overrides.thresholds?.yellow ?? DEFAULT_CONFIG.thresholds.yellow,
    },
    targetProfitFormula:
      overrides.targetProfitFormula ?? DEFAULT_CONFIG.targetProfitFormula,
    contingencyBase: overrides.contingencyBase ?? DEFAULT_CONFIG.contingencyBase,
    rounding: overrides.rounding ?? DEFAULT_CONFIG.rounding,
  };
}

/** Numerator of target profit per hour, per the selected formula (denominator is hours). */
const TARGET_PROFIT_NUMERATORS: Record<
  TargetProfitFormula,
  (incomeGoal: Cents, profitTarget: Cents) => Cents
> = {
  "income-plus-profit-over-hours": (incomeGoal, profitTarget) =>
    incomeGoal + profitTarget,
};

/**
 * The cents that target-profit-per-hour spreads across the year's billable hours, per the
 * configured formula. Divided by `annualBillableHours` in {@link module:rates}.
 */
export function targetProfitNumerator(
  formula: TargetProfitFormula,
  incomeGoal: Cents,
  profitTarget: Cents,
): Cents {
  return TARGET_PROFIT_NUMERATORS[formula](incomeGoal, profitTarget);
}

/** The base amount a contingency percentage is charged against, per the selected base. */
const CONTINGENCY_BASES: Record<
  ContingencyBase,
  (directCost: Cents, overheadAllocated: Cents) => Cents
> = {
  "direct-cost-plus-overhead": (directCost, overheadAllocated) =>
    directCost + overheadAllocated,
};

/** The cents that contingency is a percentage of, per the configured base. */
export function contingencyBaseAmount(
  base: ContingencyBase,
  directCost: Cents,
  overheadAllocated: Cents,
): Cents {
  return CONTINGENCY_BASES[base](directCost, overheadAllocated);
}

/** The configured display-rounding function (currently the single half-up rule). */
export function rounderFor(_mode: RoundingMode): (value: number) => number {
  return roundHalfUp;
}
