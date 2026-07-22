# Design — onboarding (wizard + Review)

## Context

Onboarding captures the constitution §3.2 solo-operator input model and feeds every
downstream number. It is the first place tenant-scoped business data is written, so it must
respect RLS and the store-inputs-only rule (constitution §6.3, §6.8). Phone-first: the
primary user fills this out on a phone (constitution §1).

## Goals / Non-Goals

**Goals**
- Capture the §3.2 inputs in a short, forgiving, phone-first flow.
- Play back derived rates from the engine so the math is transparent (§6.6).
- Persist inputs only, tenant-scoped, integer units.

**Non-Goals**
- No derived values persisted (recomputed by the engine every time).
- No estimate or dashboard UI.
- No multi-role/crew capture.

## Decisions

- **Store inputs only; recompute rates.** `business_settings` holds `annual_overhead_cents`,
  `owner_wage_cents_per_hour`, `labor_burden_bp`, `working_days_per_year`,
  `billable_minutes_per_day`, `income_goal_cents`, `profit_target_cents`,
  `target_margin_bp`, `default_contingency_bp`, and the optional `default_markup_bp` /
  `default_tax_rate_bp`. The Review screen and all later screens derive loaded cost,
  break-even, goals, and target profit/hr via `src/engine/rates.ts`. *Alternative:*
  caching derived rates — rejected as a source-of-truth risk (constitution §6.8); a cache
  may come later for dashboards, never as truth.
- **Optional overhead itemization sums to the total.** Items (name, amount_cents, category)
  are stored for the user's recall; the annual total is the source of truth for math. If
  items are present, the UI keeps them reconciled to the total; the engine only ever sees
  the total.
- **Three steps, phone-first.** (1) identity & overhead, (2) wage/burden + capacity,
  (3) goals. Advanced inputs (markup, tax) live in full settings, not the wizard.
- **Zod at the boundary, integers only.** Forms accept human input (dollars, %) and convert
  to cents/minutes/bp at the edge; no floats reach the store.
- **RLS-scoped writes.** All writes go through `src/db/` helpers requiring `business_id`;
  one row per business.

## Risks / Trade-offs

- [User enters dollars/percent, we need integer units] → convert-and-validate at the Zod
  boundary; round to whole cents/bp explicitly; test the conversions.
- [Itemization drifts from the total] → total is authoritative; UI reconciles; engine never
  reads items.
- [Tenant leakage on first write] → RLS policy + a tenant-isolation test on
  `business_settings` before shipping.

## Migration Plan

One forward-only Drizzle migration adding `business_settings` (and optional
`overhead_items`) with `business_id` non-null and RLS policies. Additive; no data to
backfill.

## Open Questions

- Whether overhead itemization ships in v1's wizard or only in full settings (leaning: an
  optional expander in the wizard, persisted if used).
- Exact copy for the Review screen's plain-language labels (coordinate with the profit UI).
