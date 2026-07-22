# Add the estimate builder and the profit dashboard

## Why

With the engine (math) and onboarding (inputs) in place, contractors need the two surfaces
the whole product exists for: **building an estimate** for a job, and **seeing whether it —
and the whole book of work — pulls its weight**. These are two *connected but separate*
concerns (constitution §2, §6.8): the estimate is the costing instrument the user builds;
profitability is the judgment layer that reads a finished roll-up and colors it. This change
delivers both, in separate modules, each consuming the engine — never re-deriving math.

## What Changes

- **Estimate builder (`src/estimate/`).** Create/edit estimates and their line items
  (granular categories, grouped only for display); support multiple versions per project
  (v1 / revised / Option A|B). Costs are entered; the engine solves price to `target_margin_bp`
  by default, with per-line/total override (constitution §3.4). Creating an estimate seeds
  the project's shared context.
- **Profit signaling + dashboard (`src/profit/`).** Render an estimate's red/yellow/green
  from the engine's absolute view (`EPH / targetProfitPerHour`), the break-even framing, and
  the internal roll-up (loaded cost, overhead, contingency, net profit) — all drillable
  (§6.6). Render the **portfolio dashboard**: projects ranked by the comparative view, plus
  each job's `percentOfYear` and `percentOfProfitGoal` ("this job uses 5.3% of your year and
  delivers 10.05% of your profit goal").
- **Active version drives the portfolio.** The project's active/accepted estimate version
  feeds the dashboard's "% of your year" and "% of profit goal"; other versions compute
  independently.
- **Plain language, not jargon.** The UI says "profit per hour vs your target," "loaded
  cost," "% of your year"; EPH stays internal (constitution §3.4).
- **Internal vs client-facing stays separate.** This change renders the *internal* costing
  view (true costs, overhead, EPH, colors). The client-facing document is the separate
  Client Estimate Doc tool (constitution §5).

## Capabilities

### New Capabilities
- `estimates` — estimate + line-item creation/editing, versions, and margin-solve pricing
  (the `src/estimate/` module).
- `profit-dashboard` — per-estimate signal rendering and the portfolio dashboard (the
  `src/profit/` module).

### Modified Capabilities
- None. Both consume `profit-engine` and `onboarding`; neither changes them.

## Impact

- **New code:** `src/estimate/` (line-item entities, editing, versions, tenant-scoped
  persistence), `src/profit/` (signal rendering, portfolio queries), `app/(app)/projects/[id]/`
  (estimate screens), `app/(app)/dashboard/` (portfolio), plus Drizzle schema + migration for
  `estimates` and `line_items` (RLS on, non-null `business_id`).
- **Module boundary (constitution §6.8):** `src/estimate/` and `src/profit/` are separate;
  they exchange only the engine's typed roll-up, never each other's internals. All math comes
  from `src/engine/`.
- **Depends on:** `add-profit-engine` (roll-up, signal, margin-solve) and `add-onboarding`
  (business settings the costing reads).

## Non-goals

- No AI tools — Material Finder, Photo Advisor, Code Finder, Client Estimate Doc are their
  own changes.
- No client-facing document generation (that is the Client Estimate Doc tool).
- No new financial math — everything numeric comes from the engine.
- No re-implementation of totals/colors in UI or DB (constitution §6.1).
