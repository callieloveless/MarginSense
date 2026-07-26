## Why

The dashboard today ranks jobs worst-first but never answers the first question a contractor asks
opening the app: *how is my month going?* They want one honest headline — across everything active,
are my crew hours earning what I need? The prototype leads with a "This month" profit-per-hour, a
plain verdict, and how far short of target it is. This change adds that portfolio **pulse** and gives
each ranked job card its own profit-per-hour + signal chip, so the home screen judges the book of
work at a glance and drills into any job from there.

## What Changes

- **Engine:** a portfolio aggregate — `aggregateProfitPerHour = Σ netProfit / Σ laborHours` across a
  business's active jobs; `shortfallPerHour = max(0, targetProfitPerHour − aggregateProfitPerHour)`;
  a red/yellow/green signal via the **same** absolute thresholds; **not-applicable** when the set has
  no labor hours (no priced active estimate) rather than a divide-by-zero. The result carries its
  inputs (Σ net, Σ hours, target) for drill-down.
- **Dashboard:** lead with the pulse card (aggregate profit/hr, plain verdict, shortfall, progress
  toward target, drillable to Σ net / Σ hours / target / shortfall). Reshape the existing
  worst-first cards so each shows the **job's own** profit-per-hour + a signal chip + its plain
  note. Keep the existing fair-share ranking and "% of your year / % of your profit goal" figures.
  Draft/no-estimate jobs render calmly and are excluded from the aggregate denominator; a negative
  aggregate renders honestly (red, progress clamped at zero).
- **Dashboard header + quick capture:** the prototype's header (business identity, settings entry)
  and its camera button — opening a job-picker bottom sheet (the R1 primitive's first consumer)
  that lands on the chosen job's photo surface (today's photo section; R6 grows it). With no jobs
  it teaches and offers "new job" — never a dead control.
- Plain language only (no "EPH"); color always paired with text.

## Financial-model interaction (called out per the rules)

Adds an aggregate profit-per-hour (financial math → lives in `src/engine/`, on the same thresholds).
It is **additive**: per-estimate and comparative/portfolio math are unchanged. No tenant-isolation or
tools-suggest surface is touched. v1 "month" = the set of active jobs (the same set the dashboard
already loads); true calendar-month scoping is a **non-goal**.

## Capabilities

### New Capabilities
<!-- None. -->

### Modified Capabilities
- `profit-engine`: add a portfolio aggregate profit-per-hour + shortfall + signal (same thresholds,
  NA on zero hours, inputs carried).
- `profit-dashboard`: add the "This month" pulse headline; each ranked job card also shows the job's
  own profit-per-hour and a signal chip.

## Impact

- **Code:** `src/engine/signal.ts` (or a small portfolio helper) + `src/engine/index.ts` export;
  `src/profit/profit.ts` (surface the aggregate for the dashboard); `app/(app)/dashboard/page.tsx` +
  a pulse card built on the R1 primitives.
- **Tests:** aggregate over mixed jobs, zero-hours → NA, shortfall clamp at/above target, boundary
  colors (0.79/0.80/0.99/1.00).
- **No touch:** schema/migrations, `src/db/`, RLS, `src/tools/`, `src/ai/`. Depends on R1 primitives
  and reads the same active-estimate set already loaded.

## Non-goals

- True calendar-month scoping (v1 = active jobs).
- The rich job hub (R4) and the per-line estimate editor (R5).
- Historical/trend charts or a time series. No new data.
