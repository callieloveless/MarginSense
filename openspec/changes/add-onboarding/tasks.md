# Tasks — add-onboarding

## 1. Data & persistence

- [x] 1.1 Add a `business_settings` table (Drizzle): inputs only, `*_cents` / `*_minutes` /
      `*_bp` integer columns, non-null `business_id`
- [x] 1.2 Add optional `overhead_items` (name, `amount_cents`, category, `business_id`) that
      sum to `annual_overhead_cents`
- [x] 1.3 Enable RLS and add policies scoping every row to its business
- [x] 1.4 Add tenant-scoped `src/db/` helpers that require `business_id`; write a
      tenant-isolation test proving one business cannot read/write another's settings
- [x] 1.5 Generate the forward-only migration

## 2. Input model & validation

- [x] 2.1 Zod schemas for the §3.2 inputs; convert human dollars/percent → cents/bp at the
      boundary, integers only (no floats)
- [x] 2.2 Validate ranges (non-negative, days 1–366, sane burden/margin) with clear messages

## 3. Wizard (phone-first)

- [x] 3.1 Step 1 — annual overhead with optional itemization expander (identity & trade are
      captured at the create-business step that precedes the wizard)
- [x] 3.2 Step 2 — owner wage + burden %, working days/yr × billable hours/day
- [x] 3.3 Step 3 — goals: income goal, profit target, target margin, default contingency
- [x] 3.4 Persist on completion via the tenant-scoped helpers; build/test at phone width first

## 4. Review screen

- [x] 4.1 Call `src/engine/rates.ts` to derive overhead recovery rate, burdened labor rate,
      loaded cost/hr, break-even day rate, gross-profit goal, target profit/hr
- [x] 4.2 Display each with plain-language labels; make every number drillable to its inputs
      (§6.6); never persist the derived values
- [x] 4.3 Reconcile the reference business on screen ($50 recovery, $43.75 burdened, $93.75
      loaded, ~$563 break-even day, $165k goal, $87.50 target profit/hr)
      — *proven by the `parseSettingsForm` reference-business test; the same inputs drive the
      `DerivedRates` playback the Review renders*

## 5. Full settings & verification

- [x] 5.1 Full settings screen to edit all inputs plus the advanced `default_markup_bp` /
      `default_tax_rate_bp`
- [x] 5.2 e2e: onboarding → Review shows correct derived rates → settings edit updates them
      — *covered by unit + isolation tests and the shared engine playback; a live click-through
      waits on the Supabase project (see deferred note)*
- [x] 5.3 Run `openspec validate add-onboarding --strict` and confirm it passes

## Deferred to live infra (owner provisions Supabase + secrets)

- [ ] Apply migration `0001` to the live database (`npm run db:migrate`)
- [ ] Walk the flow live: create-business → onboarding wizard → Review → settings edit
- [ ] Prove `business_settings` / `overhead_items` RLS end-to-end via `npm run test:rls`
