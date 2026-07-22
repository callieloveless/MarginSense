# Tasks — add-onboarding

## 1. Data & persistence

- [ ] 1.1 Add a `business_settings` table (Drizzle): inputs only, `*_cents` / `*_minutes` /
      `*_bp` integer columns, non-null `business_id`
- [ ] 1.2 Add optional `overhead_items` (name, `amount_cents`, category, `business_id`) that
      sum to `annual_overhead_cents`
- [ ] 1.3 Enable RLS and add policies scoping every row to its business
- [ ] 1.4 Add tenant-scoped `src/db/` helpers that require `business_id`; write a
      tenant-isolation test proving one business cannot read/write another's settings
- [ ] 1.5 Generate the forward-only migration

## 2. Input model & validation

- [ ] 2.1 Zod schemas for the §3.2 inputs; convert human dollars/percent → cents/bp at the
      boundary, integers only (no floats)
- [ ] 2.2 Validate ranges (non-negative, days 1–366, sane burden/margin) with clear messages

## 3. Wizard (phone-first)

- [ ] 3.1 Step 1 — identity & trade + annual overhead (with optional itemization expander)
- [ ] 3.2 Step 2 — owner wage + burden %, working days/yr × billable minutes/day
- [ ] 3.3 Step 3 — goals: income goal, profit target, target margin, default contingency
- [ ] 3.4 Persist on completion via the tenant-scoped helpers; build/test at phone width first

## 4. Review screen

- [ ] 4.1 Call `src/engine/rates.ts` to derive overhead recovery rate, burdened labor rate,
      loaded cost/hr, break-even day rate, gross-profit goal, target profit/hr
- [ ] 4.2 Display each with plain-language labels; make every number drillable to its inputs
      (§6.6); never persist the derived values
- [ ] 4.3 Reconcile the reference business on screen ($50 recovery, $43.75 burdened, $93.75
      loaded, ~$563 break-even day, $165k goal, $87.50 target profit/hr)

## 5. Full settings & verification

- [ ] 5.1 Full settings screen to edit all inputs plus the advanced `default_markup_bp` /
      `default_tax_rate_bp`
- [ ] 5.2 e2e: onboarding → Review shows correct derived rates → settings edit updates them
- [ ] 5.3 Run `openspec validate add-onboarding --strict` and confirm it passes
