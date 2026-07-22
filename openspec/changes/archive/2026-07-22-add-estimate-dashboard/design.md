# Design — estimate builder + profit dashboard

## Context

This change delivers the two user-facing surfaces that sit on top of the engine and
onboarding. The constitution insists they stay separate concerns (§2, §6.8): the estimate
is what the user *builds*; profitability is how the app *judges* it. Keeping them in
distinct modules that only exchange the engine's typed roll-up is the whole point of this
design — it is what stops estimate editing and profit signaling from congealing into one
blob.

## Goals / Non-Goals

**Goals**
- A phone-first estimate builder with granular line items, versions, and margin-solve
  pricing.
- Per-estimate and portfolio red/yellow/green, every figure drillable, all from the engine.
- A clean module seam: `src/estimate/` and `src/profit/` never import each other's
  internals.

**Non-Goals**
- No AI tools; no client-facing document; no new math.
- No caching of derived values as source of truth.

## Decisions

- **Two modules, one seam.** `src/estimate/` owns line items, editing, and versions;
  `src/profit/` owns signal rendering and portfolio queries. They communicate only through
  the engine's typed roll-up output — `src/profit/` reads a finished estimate roll-up and
  colors it; `src/estimate/` never imports `src/profit/`. *Alternative:* one combined
  "estimate + profit" module — rejected per constitution §6.8.
- **Costs entered, price margin-solved by default.** The builder sends costs +
  `target_margin_bp` to `src/engine/estimate.ts`; the engine solves the price. A per-line or
  total override flips that line/total to entered-price and margin becomes an outcome. The
  builder stores the entered costs and any overrides — not the solved price as truth (it can
  be recomputed).
- **Versions are first-class.** A project has many estimate versions; each computes its
  signal independently. One version is flagged **active/accepted** and is the only one that
  feeds the portfolio's `percentOfYear` / `percentOfProfitGoal`.
- **Portfolio math from the engine.** The dashboard ranks projects by the engine's
  comparative `weight` and shows each active job's `percentOfYear` and `percentOfProfitGoal`.
  `src/profit/` assembles the inputs (per-project roll-ups, annual settings) and calls the
  engine; it computes no ratios itself.
- **Plain language in the UI.** Labels are contractor-plain; EPH stays internal. Colors are
  always paired with text (constitution §6, techstack §6).
- **Tenant-scoped persistence.** `estimates` and `line_items` carry non-null `business_id`
  with RLS; all access via `src/db/` helpers.

## Risks / Trade-offs

- [Estimate and profit modules leak into each other] → enforce the seam in review; the only
  shared type is the engine's roll-up; add a lint/boundary check if it starts to blur.
- [Which version feeds the portfolio is ambiguous] → an explicit `is_active` flag per
  project; exactly one active version; test the selection.
- [Margin-solve vs override confusion] → store costs + overrides, recompute the rest; surface
  clearly in the UI which lines are solved vs overridden.
- [Tenant leakage across estimates] → RLS + tenant-isolation tests on `estimates` and
  `line_items`.

## Migration Plan

Forward-only Drizzle migrations adding `estimates` (with a version identity and `is_active`)
and `line_items`, both `business_id` non-null with RLS. Additive; no backfill.

## Open Questions

- Exact version model (linear v1/v2 vs branching Option A|B) and how "active" is chosen when
  none is accepted yet.
- Dashboard ranking tie-breaks and how red jobs are surfaced first.
