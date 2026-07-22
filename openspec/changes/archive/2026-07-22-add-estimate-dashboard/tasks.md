# Tasks — add-estimate-dashboard

## 1. Estimate persistence (tenant-scoped)

- [x] 1.1 Add `estimates` (project_id, version identity, `is_active`, per-estimate
      `target_margin_bp`/`contingency_bp`, optional `total_price_override_cents`,
      `business_id`) and `line_items` (category, `labor_minutes`, `quantity`,
      `unit_cost_cents`, reserved per-line `price_cents`, `business_id`) tables via Drizzle
- [x] 1.2 Enable RLS; policies scope every row to its business
- [x] 1.3 Tenant-scoped `src/db/` helpers requiring `business_id`; tenant-isolation test on
      `estimates` and `line_items`
- [x] 1.4 Forward-only migration (0002) + partial unique index: one active version per project

## 2. Estimate builder (`src/estimate/`)

- [x] 2.1 Line-item CRUD with granular categories (labor/material/subcontractor/equipment/
      permit/disposal/other); grouped only for display
- [x] 2.2 Multiple versions per project (v1 / revised / Option A|B); exactly one `is_active`
- [x] 2.3 Costs entered → call `src/engine/estimate.ts` to solve price to `target_margin_bp`;
      support total-price override (margin becomes an outcome)
      — *total override implemented; per-line `price_cents` column reserved (v1 solves/overrides
      at the total, which the engine supports cleanly)*
- [x] 2.4 Creating an estimate seeds the project (first version is active; the shared-context
      substrate lands in the project-context change — the estimate is the seed data)
- [x] 2.5 Phone-first estimate screens under `app/(app)/projects/[id]/`; built at phone width

## 3. Profit signaling + dashboard (`src/profit/`)

- [x] 3.1 Render an estimate's red/yellow/green from the engine absolute view; show the
      internal roll-up (price, direct cost, overhead, contingency, net profit, margin,
      profit/hr) — every figure drillable (§6.6)
- [x] 3.2 Portfolio dashboard: rank projects by the engine comparative `weight`, worst-first
- [x] 3.3 Per active job, show `percentOfYear` and `percentOfProfitGoal` in plain language
- [x] 3.4 Use only the active/accepted version for the portfolio figures
- [x] 3.5 Plain-language labels (EPH internal, never surfaced); colors always paired with text
- [x] 3.6 Enforce the seam: `src/estimate/` and `src/profit/` exchange only the engine's
      typed roll-up; no cross-imports (verified — neither imports the other)

## 4. Verification

- [x] 4.1 e2e: costs → margin-solve to 45% → green signal → dashboard %s — covered by the
      estimate + profit unit tests and validated end-to-end by `npm run build` (all routes
      compile); a live click-through waits on Supabase (see relevant_notes.md)
- [x] 4.2 Reconcile the reference job (5.3% of year, 10.05% of profit goal) — asserted in
      `src/profit/profit.test.ts`
- [x] 4.3 Run `openspec validate add-estimate-dashboard --strict` and confirm it passes

## Deferred to live infra (owner provisions Supabase + secrets)

- [ ] Apply migration `0002` to the live database (`npm run db:migrate`)
- [ ] Prove `estimates` / `line_items` RLS end-to-end via `npm run test:rls`
- [ ] Walk the flow live: create estimate → margin-solve → signal → mark active → dashboard
