/**
 * Derived business rates (constitution §3.3), computed on an **annual** basis from the
 * solo-operator settings captured in onboarding. Every rate here is derived, never entered:
 * the UI and DB store the inputs and call this module to recompute. Monthly figures some
 * screens show are `/12` display derivations, never a separate source of truth.
 */

import type { BasisPoints, Cents, CentsPerHour, Computed, Minutes } from "./money.js";
import { bpToRatio, roundHalfUp, safeDivide } from "./money.js";
import type { EngineConfig } from "./config.js";
import { DEFAULT_CONFIG, targetProfitNumerator } from "./config.js";

/**
 * The solo owner-operator business settings the engine needs to derive rates. All money is
 * integer cents, time is integer minutes, percentages are basis points (constitution §3.2).
 */
export interface BusinessSettings {
  /** Single annual overhead figure — the source of truth for overhead math. */
  readonly annualOverheadCents: Cents;
  /** Owner's hourly wage on the tools. */
  readonly ownerWageCentsPerHour: CentsPerHour;
  /** Payroll taxes, workers' comp, benefits as a percentage of wage. */
  readonly laborBurdenBp: BasisPoints;
  /** Working days per year (integer). */
  readonly workingDaysPerYear: number;
  /** Billable minutes per working day (integer) — excludes driving/quoting/admin. */
  readonly billableMinutesPerDay: Minutes;
  /** Target owner pay for the year. */
  readonly incomeGoalCents: Cents;
  /** Target business profit for the year, on top of owner pay. */
  readonly profitTargetCents: Cents;
}

/**
 * The full set of derived rates. Values that divide by billable capacity are
 * {@link Computed} — not-applicable when annual billable hours are zero, never a
 * divide-by-zero. `burdenedLaborRate` and the goal are always defined.
 */
export interface BusinessRates {
  /** `working_days × billable_minutes_per_day` (integer minutes). */
  readonly annualBillableMinutes: Minutes;
  /** `annualBillableMinutes / 60` (hours; may be fractional). */
  readonly annualBillableHours: number;
  /** `annual_overhead / annualBillableHours` — overhead each billed hour must recover. */
  readonly overheadRecoveryRate: Computed<CentsPerHour>;
  /** `owner_wage × (1 + burden)` — true cost of an owner hour. */
  readonly burdenedLaborRate: CentsPerHour;
  /** `overheadRecoveryRate + burdenedLaborRate` — break-even framing of an owner hour. */
  readonly loadedCostPerHour: Computed<CentsPerHour>;
  /** `loadedCostPerHour × billable_hours_per_day` — what a day must bill to cover cost. */
  readonly breakEvenDayRate: Computed<Cents>;
  /** `annual_overhead + income_goal + profit_target` — the year's gross-profit goal. */
  readonly grossProfitGoal: Cents;
  /** `(income_goal + profit_target) / annualBillableHours` — the benchmark for the signal. */
  readonly targetProfitPerHour: Computed<CentsPerHour>;
}

/** Annual billable minutes from the two time inputs (`working_days × billable_min/day`). */
export function annualBillableMinutes(settings: BusinessSettings): Minutes {
  return settings.workingDaysPerYear * settings.billableMinutesPerDay;
}

/** Burdened labor rate: `owner_wage × (1 + burden)`; e.g. $35 × 1.25 = $43.75/hr. */
export function burdenedLaborRate(settings: BusinessSettings): CentsPerHour {
  return settings.ownerWageCentsPerHour * (1 + bpToRatio(settings.laborBurdenBp));
}

/** Gross-profit goal: `overhead + income_goal + profit_target`; e.g. $60k + $90k + $15k. */
export function grossProfitGoal(settings: BusinessSettings): Cents {
  return (
    settings.annualOverheadCents +
    settings.incomeGoalCents +
    settings.profitTargetCents
  );
}

/**
 * Derive the full set of annual business rates from settings, honoring the per-business
 * {@link EngineConfig} for the target-profit formula. Divide-by-capacity rates return
 * not-applicable when annual billable hours are zero.
 */
export function deriveRates(
  settings: BusinessSettings,
  config: EngineConfig = DEFAULT_CONFIG,
): BusinessRates {
  const minutes = annualBillableMinutes(settings);
  const hours = minutes / 60;

  const overheadRecoveryRate = safeDivide(
    settings.annualOverheadCents,
    hours,
    "no annual billable hours",
  );
  const burdened = burdenedLaborRate(settings);

  const loadedCostPerHour: Computed<CentsPerHour> = overheadRecoveryRate.ok
    ? { ok: true, value: overheadRecoveryRate.value + burdened }
    : overheadRecoveryRate;

  const billableHoursPerDay = settings.billableMinutesPerDay / 60;
  const breakEvenDayRate: Computed<Cents> = loadedCostPerHour.ok
    ? { ok: true, value: roundHalfUp(loadedCostPerHour.value * billableHoursPerDay) }
    : loadedCostPerHour;

  const targetNumerator = targetProfitNumerator(
    config.targetProfitFormula,
    settings.incomeGoalCents,
    settings.profitTargetCents,
  );
  const targetProfitPerHour = safeDivide(
    targetNumerator,
    hours,
    "no annual billable hours",
  );

  return {
    annualBillableMinutes: minutes,
    annualBillableHours: hours,
    overheadRecoveryRate,
    burdenedLaborRate: burdened,
    loadedCostPerHour,
    breakEvenDayRate,
    grossProfitGoal: grossProfitGoal(settings),
    targetProfitPerHour,
  };
}
