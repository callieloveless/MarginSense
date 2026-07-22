# Add business onboarding (wizard + Review)

## Why

The profit engine is only as honest as its inputs. A contractor cannot see whether a job
pulls its weight until the business has told MarginSense its overhead, wage, capacity, and
goals. Onboarding captures the solo owner-operator model (constitution §3.2) in a short,
phone-first wizard and then shows a **Review** screen that plays back the derived rates
(§3.3) — loaded cost, break-even day, target profit/hr — so the numbers feel earned, not
magic (constitution §6.6). This is the second change in sequence, after `add-profit-engine`.

## What Changes

- Add a **3-step onboarding wizard** (phone-first) capturing the §3.2 inputs: identity &
  trade; annual overhead (with optional itemization that sums to the total); owner wage +
  burden %; working days/yr × billable minutes/day; and the goals block (income goal,
  profit target, target margin, default contingency).
- Add a **Review screen** that calls the engine (`src/engine/rates.ts`) to play back the
  derived rates — overhead recovery rate, burdened labor rate, loaded cost/hr, break-even
  day rate, gross-profit goal, target profit/hr — with every number drillable to its inputs.
- Add **business settings** persistence: a tenant-scoped `business_settings` row storing the
  inputs only (never derived values — those are always recomputed by the engine,
  constitution §6.8). Money in `*_cents`, time in `*_minutes`, percentages in `*_bp`.
- Add **full settings** (outside the wizard) for the optional advanced inputs
  (`default_markup_bp`, `default_tax_rate_bp`) and for editing everything later.
- Validate all input at the boundary with Zod; store integers only.

## Capabilities

### New Capabilities
- `onboarding` — the wizard, the Review screen, and business-settings persistence for the
  solo-operator input model.

### Modified Capabilities
- None. Consumes `profit-engine` (rates); does not change it.

## Impact

- **New code:** `app/(auth)/onboarding/` (wizard + Review, phone-first), `app/(app)/settings/`
  (full settings), `src/db/` schema + migration for `business_settings` (RLS on, non-null
  `business_id`), Zod schemas for the input model. Rendering of derived rates goes through
  `src/engine/`; nothing derived is persisted.
- **Depends on:** `add-profit-engine` (the `rates.ts` derivations).
- **Feeds:** `add-estimate-dashboard` (estimates read these settings for costing and the
  dashboard reads them for the portfolio view).

## Non-goals

- No estimate creation or dashboard — those are `add-estimate-dashboard`.
- No multi-role/crew inputs — single owner-operator for v1 (constitution §3.2); the schema
  leaves room without surfacing them.
- No financial math in the UI or DB — all rates come from the engine.
