/**
 * Plays back the derived business rates (constitution §3.3) from stored settings —
 * shared by the onboarding Review screen and full settings. Every number here is
 * **recomputed by `src/engine/`**, never stored (constitution §6.8), and each is drillable
 * to the inputs that produced it (§6.6) via a native `<details>` disclosure — no client JS.
 *
 * A private folder (`_components`) so it is not a route.
 */

import {
  type BusinessRates,
  type BusinessSettings,
  type Cents,
  type CentsPerHour,
  type Computed,
  deriveRates,
  formatCents,
} from "@/src/engine";
import type { BusinessSettingsRow } from "@/src/db/schema";

/** Map a stored settings row to the engine's input model (the engine ignores the pricing
 * inputs — margin, contingency, markup, tax — which belong to estimate math, not rates). */
export function settingsRowToEngine(row: BusinessSettingsRow): BusinessSettings {
  return {
    annualOverheadCents: row.annualOverheadCents,
    ownerWageCentsPerHour: row.ownerWageCentsPerHour,
    laborBurdenBp: row.laborBurdenBp,
    workingDaysPerYear: row.workingDaysPerYear,
    billableMinutesPerDay: row.billableMinutesPerDay,
    incomeGoalCents: row.incomeGoalCents,
    profitTargetCents: row.profitTargetCents,
  };
}

/** Format an hours figure (may be fractional) as "1,200 hrs/yr" style text. */
function formatHours(hours: number): string {
  const rounded = Math.round(hours * 10) / 10;
  const whole = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  return whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** Render a computed money/rate value, or an em dash + reason when not applicable. */
function computedText(c: Computed<Cents | CentsPerHour>, suffix = ""): string {
  return c.ok ? `${formatCents(c.value)}${suffix}` : "—";
}

function reasonText(c: Computed<unknown>): string | null {
  return c.ok ? null : c.reason;
}

/** One rate row: label, value, and a drill-down showing the inputs behind it (§6.6). */
function RateRow({
  label,
  value,
  drill,
}: {
  label: string;
  value: string;
  drill: string;
}) {
  return (
    <details className="border-b border-neutral-200 py-2 last:border-b-0 dark:border-neutral-800">
      <summary className="flex cursor-pointer items-center justify-between gap-3 list-none">
        <span className="text-sm text-neutral-600 dark:text-neutral-400">{label}</span>
        <span className="text-base font-semibold tabular-nums">{value}</span>
      </summary>
      <p className="mt-1 pr-1 text-xs text-neutral-500">{drill}</p>
    </details>
  );
}

/**
 * The derived-rates playback. Give it the stored settings row; it derives and renders the
 * six rates the onboarding spec calls out, each drillable to its inputs.
 */
export function DerivedRates({ settings }: { settings: BusinessSettingsRow }) {
  const engineSettings = settingsRowToEngine(settings);
  const rates: BusinessRates = deriveRates(engineSettings);

  const wage = formatCents(settings.ownerWageCentsPerHour);
  const burdenPct = (settings.laborBurdenBp / 100).toString();
  const overhead = formatCents(settings.annualOverheadCents);
  const income = formatCents(settings.incomeGoalCents);
  const profit = formatCents(settings.profitTargetCents);
  const billableHoursPerDay = settings.billableMinutesPerDay / 60;
  const annualHours = formatHours(rates.annualBillableHours);

  const notApplicable = reasonText(rates.overheadRecoveryRate);

  return (
    <div>
      {notApplicable ? (
        <p className="mb-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-200">
          Some rates need billable hours to compute ({notApplicable}). Add working days and
          billable hours to see them.
        </p>
      ) : null}

      <div className="rounded-lg border border-neutral-200 px-3 dark:border-neutral-800">
        <RateRow
          label="Overhead recovery rate"
          value={computedText(rates.overheadRecoveryRate, "/hr")}
          drill={`${overhead} annual overhead ÷ ${annualHours} billable hrs/yr (${settings.workingDaysPerYear} days × ${formatHours(billableHoursPerDay)} hrs/day).`}
        />
        <RateRow
          label="Burdened labor rate"
          value={`${formatCents(rates.burdenedLaborRate)}/hr`}
          drill={`${wage}/hr wage × (1 + ${burdenPct}% burden).`}
        />
        <RateRow
          label="Loaded cost per hour"
          value={computedText(rates.loadedCostPerHour, "/hr")}
          drill="Overhead recovery rate + burdened labor rate — the break-even cost of an owner hour."
        />
        <RateRow
          label="Break-even day rate"
          value={computedText(rates.breakEvenDayRate)}
          drill={`Loaded cost/hr × ${formatHours(billableHoursPerDay)} billable hrs/day — what a day must bill to cover cost.`}
        />
        <RateRow
          label="Gross-profit goal"
          value={formatCents(rates.grossProfitGoal)}
          drill={`${overhead} overhead + ${income} income goal + ${profit} profit target.`}
        />
        <RateRow
          label="Target profit per hour"
          value={computedText(rates.targetProfitPerHour, "/hr")}
          drill={`(${income} income goal + ${profit} profit target) ÷ ${annualHours} billable hrs/yr — the benchmark your jobs are measured against.`}
        />
      </div>
    </div>
  );
}
