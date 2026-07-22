# Tasks — add-estimate-dashboard

## 1. Estimate persistence (tenant-scoped)

- [ ] 1.1 Add `estimates` (project_id, version identity, `is_active`, `business_id`) and
      `line_items` (category, `labor_minutes`, `quantity`, `unit_cost_cents`, override
      fields, `business_id`) tables via Drizzle
- [ ] 1.2 Enable RLS; policies scope every row to its business
- [ ] 1.3 Tenant-scoped `src/db/` helpers requiring `business_id`; tenant-isolation test on
      `estimates` and `line_items`
- [ ] 1.4 Forward-only migration

## 2. Estimate builder (`src/estimate/`)

- [ ] 2.1 Line-item CRUD with granular categories (labor/material/subcontractor/equipment/
      permit/disposal/other); group only for display
- [ ] 2.2 Multiple versions per project (v1 / revised / Option A|B); exactly one `is_active`
- [ ] 2.3 Costs entered → call `src/engine/estimate.ts` to solve price to `target_margin_bp`;
      support per-line/total override (margin becomes an outcome)
- [ ] 2.4 Creating an estimate seeds the project's shared context
- [ ] 2.5 Phone-first estimate screens under `app/(app)/projects/[id]/`; build/test at phone
      width first

## 3. Profit signaling + dashboard (`src/profit/`)

- [ ] 3.1 Render an estimate's red/yellow/green from the engine absolute view; show the
      internal roll-up (loaded cost, overhead, contingency, net profit) — every figure
      drillable (§6.6)
- [ ] 3.2 Portfolio dashboard: rank projects by the engine comparative `weight`
- [ ] 3.3 Per active job, show `percentOfYear` and `percentOfProfitGoal` in plain language
      ("uses 5.3% of your year, delivers 10.05% of your profit goal")
- [ ] 3.4 Use only the active/accepted version for the portfolio figures
- [ ] 3.5 Plain-language labels (EPH internal); colors always paired with text
- [ ] 3.6 Enforce the seam: `src/estimate/` and `src/profit/` exchange only the engine's
      typed roll-up; no cross-imports of internals

## 4. Verification

- [ ] 4.1 e2e: create estimate → margin-solve to 45% → see green signal → dashboard shows
      the job's % of year and % of profit goal
- [ ] 4.2 Reconcile the reference job on screen (EPH ≈ $209/hr → deep green; 5.3% of year;
      10.05% of profit goal)
- [ ] 4.3 Run `openspec validate add-estimate-dashboard --strict` and confirm it passes
