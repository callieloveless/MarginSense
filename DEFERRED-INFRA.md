# Deferred to live infrastructure

> Running list of work that is **built and tested in code** but cannot be *proven* or
> *run* until a live Supabase project + secrets exist. Everything here is intentionally
> parked, not forgotten. When the database lands, work top-to-bottom.
>
> **Created:** 2026-07-22 · Update as changes land or items clear.

## 0. The blocker: provision Supabase (do this first)

Nothing below can happen until there is a Supabase project and the app has its secrets.

- [ ] Create a Supabase project (Postgres + Auth).
- [ ] Fill `.env.local` from [`.env.example`](./.env.example):
      `DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
      (Until these are set, the app renders "connect Supabase" skeletons and
      `getServerSession()` returns `unconfigured` — by design.)
- [ ] Confirm the connection: `npm run dev` and load a page without the unconfigured banner.

## 1. Apply migrations (forward-only)

Run in order against the live DB — `npm run db:migrate`.

- [ ] `0000_tenant_spine` — `businesses`, `users`, `projects` + RLS policies + grants.
- [ ] `0001_brave_spot` — `business_settings`, `overhead_items` + RLS policies + grants.

> Migrations are versioned and forward-only (constitution §6.4). RLS statements are
> appended to each migration file, so schema and policies apply together — there is no
> window where a table exists unprotected.

## 2. Prove Row-Level Security end-to-end

App-layer tenant isolation is already proven by the in-memory tests (`tenant.test.ts`,
`settings.test.ts`). What still needs a real database is the **RLS layer** — that the
Postgres policies themselves block cross-tenant reads/writes.

- [ ] Run `npm run test:rls` (opt-in; skipped without `DATABASE_URL`) and confirm the
      cross-tenant read/write contracts in `src/db/tenant.rls.test.ts` pass against two
      seeded businesses with real sessions.
- [ ] **Gap to close:** there is no RLS test yet for `business_settings` / `overhead_items`
      (only for `projects`). Extend the `test:rls` suite to cover the onboarding tables
      before trusting them in production.

## 3. Walk the money-critical flows live

Click through on a phone-width viewport (constitution §1) once infra is up.

- [ ] **Tenancy:** sign-in → create-business → add a project; confirm the project list is
      scoped to the business.
- [ ] **Onboarding:** create-business → 3-step wizard → **Review** shows the derived rates
      → edit in **Settings** and confirm the rates recompute.
- [ ] **Reference-business check:** enter $60k overhead, $35/hr wage, 25% burden,
      200 days × 6 billable hrs/day, $90k income goal, $15k profit target, and confirm
      Review shows **$50.00/hr** recovery, **$43.75/hr** burdened, **$93.75/hr** loaded,
      **$562.50** break-even day, **$165,000** gross-profit goal, **$87.50/hr** target
      profit/hr. (The conversion math is unit-tested; this confirms the live render.)

## 4. Production hosting (later, from the roadmap's launch pass)

- [ ] Vercel project + environment variables.
- [ ] Production Supabase (separate from any dev project); apply all migrations there.
- [ ] Confirm middleware session refresh + auth redirects work on the deployed domain.

---

### How this list is maintained

Each OpenSpec change that defers work to live infra adds its items here (see the
"Deferred to live infra" sections in
[`openspec/changes/*/tasks.md`](./openspec/changes/) and the archived ones under
`openspec/changes/archive/`). This file is the single at-a-glance view; the change tasks
remain the per-change record.
