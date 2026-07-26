/**
 * Plays back the derived business rates (constitution §3.3) from stored settings — shared by the
 * onboarding Review screen and full Settings. Every number here is **recomputed by `src/engine/`**,
 * never stored (constitution §6.8), and each is drillable to the inputs that produced it (§6.6) via
 * a native `<details>` disclosure — no client JS. Grouped into what a contractor actually reads:
 * capacity, what an hour costs, and the targets a job is judged against.
 *
 * A private folder (`_components`) so it is not a route.
 */

import type { ReactNode } from "react";
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

/** Format an hours figure (may be fractional) as "1,200" style text. */
function formatHours(hours: number): string {
  const rounded = Math.round(hours * 10) / 10;
  const whole = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  return whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** Render a computed money/rate value, or an em dash when not applicable. */
function computedText(c: Computed<Cents | CentsPerHour>, suffix = ""): string {
  return c.ok ? `${formatCents(c.value)}${suffix}` : "—";
}

/** One drillable rate row: label, value, and the inputs behind it (§6.6). */
function RateRow({
  label,
  value,
  drill,
  emphasis = false,
}: {
  label: string;
  value: string;
  drill: string;
  emphasis?: boolean;
}) {
  return (
    <details className="border-b border-line-soft last:border-b-0">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 py-2.5">
        <span className={`text-sm ${emphasis ? "font-semibold text-ink" : "text-ink-soft"}`}>
          {label}
        </span>
        <span
          className={`tabular-nums ${emphasis ? "text-lg font-bold text-brand" : "text-base font-semibold text-ink"}`}
        >
          {value}
        </span>
      </summary>
      <p className="pb-2.5 pr-1 text-xs leading-relaxed text-muted">{drill}</p>
    </details>
  );
}

/** A titled group of rate rows on a surface card. */
function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">{title}</div>
      <div className="rounded-2xl border border-line bg-surface px-4">{children}</div>
    </div>
  );
}

/**
 * The derived-rates playback. Give it the stored settings row; it derives and renders the rates —
 * grouped and drillable — that a contractor uses to sanity-check setup and to price.
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

  const noCapacity = !rates.overheadRecoveryRate.ok;

  return (
    <div className="space-y-4">
      {noCapacity ? (
        <p className="rounded-xl border border-notice-line bg-notice-bg px-3 py-2 text-xs text-notice-fg">
          Some numbers need billable hours to compute. Add working days and billable hours per day
          to see them.
        </p>
      ) : null}

      <Group title="Your capacity">
        <RateRow
          label="Billable hours a year"
          value={`${annualHours} hrs`}
          drill={`${settings.workingDaysPerYear} working days × ${formatHours(billableHoursPerDay)} billable hrs/day.`}
        />
      </Group>

      <Group title="What an hour costs you">
        <RateRow
          label="Monthly overhead"
          value={formatCents(rates.monthlyOverheadCents)}
          drill={`${overhead} annual overhead ÷ 12. The annual figure is the one the math uses.`}
        />
        <RateRow
          label="Overhead recovery rate"
          value={computedText(rates.overheadRecoveryRate, "/hr")}
          drill={`${overhead} annual overhead ÷ ${annualHours} billable hrs/yr — overhead every billed hour must recover.`}
        />
        <RateRow
          label="Burdened labor rate"
          value={`${formatCents(rates.burdenedLaborRate)}/hr`}
          drill={`${wage}/hr wage × (1 + ${burdenPct}% burden) — the true cost of an owner hour.`}
        />
        <RateRow
          label="Loaded cost per hour"
          value={computedText(rates.loadedCostPerHour, "/hr")}
          drill="Overhead recovery rate + burdened labor rate — the break-even cost of an owner hour."
        />
        <RateRow
          label="Break-even day rate"
          value={computedText(rates.breakEvenDayRate)}
          drill={`Loaded cost/hr × ${formatHours(billableHoursPerDay)} billable hrs/day — what a day must bill just to cover cost.`}
        />
      </Group>

      <Group title="Your targets">
        <RateRow
          label="Gross-profit goal"
          value={formatCents(rates.grossProfitGoal)}
          drill={`${overhead} overhead + ${income} income goal + ${profit} profit target — what the year's jobs must throw off.`}
        />
        <RateRow
          label="Target profit per hour"
          value={computedText(rates.targetProfitPerHour, "/hr")}
          emphasis
          drill={`(${income} income goal + ${profit} profit target) ÷ ${annualHours} billable hrs/yr — the benchmark every job is measured against (green ≥ this).`}
        />
        <RateRow
          label="Rate an hour must bill to pull its weight"
          value={computedText(rates.targetBillRatePerHour, "/hr")}
          emphasis
          drill="Loaded cost/hr + target profit/hr. Price an hour of labor below this and that line drags the job down (before contingency)."
        />
      </Group>
    </div>
  );
}
