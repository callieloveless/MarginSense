# Relevant notes

> A living scratchpad of things worth remembering while working in this repo — deferred
> work, gotchas, and conventions that aren't obvious from the code. **Skim this at the
> start of a task and add to it as you learn something worth carrying forward.** It is not
> a spec (specs live in `openspec/`) and not the roadmap ([`PROGRESS.md`](./PROGRESS.md)) —
> it's the "stuff you'd tell the next person" file.
>
> **Started:** 2026-07-22. Newest notes near the top of each section; date new entries.

## Deferred to live infrastructure

Work that is **built and tested in code** but can't be *proven* or *run* until a live
Supabase project + secrets exist. Nothing here happens until the database is provisioned.

### 0. Provision Supabase (the blocker — do first)
- [ ] Create a Supabase project (Postgres + Auth).
- [ ] Fill `.env.local` from [`.env.example`](./.env.example): `DATABASE_URL`,
      `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Until these are set the
      app renders "connect Supabase" skeletons and `getServerSession()` returns
      `unconfigured` — by design.

### 1. Apply migrations (forward-only, `npm run db:migrate`)
- [ ] `0000_tenant_spine` — `businesses`, `users`, `projects` + RLS + grants.
- [ ] `0001_brave_spot` — `business_settings`, `overhead_items` + RLS + grants.
- [ ] `0002_fair_lethal_legion` — `estimates`, `line_items` + RLS + grants + the
      one-active-version-per-project partial unique index.
- [ ] `0003_chunky_sumo` — `context_entries`, `conversation_messages`, `suggestions` + RLS +
      grants.

### 2. Prove Row-Level Security end-to-end
App-layer tenant isolation is already proven by in-memory tests (`tenant.test.ts`,
`settings.test.ts`). The **RLS layer** (the Postgres policies themselves) needs a real DB.
- [ ] `npm run test:rls` (opt-in; skipped without `DATABASE_URL`) — the cross-tenant
      read/write contracts in `src/db/tenant.rls.test.ts` against two seeded businesses.
- [ ] **Known gap:** the `test:rls` suite only covers `projects`. Extend it to
      `business_settings` / `overhead_items` (onboarding) and `estimates` / `line_items`
      (add-estimate-dashboard) and `context_entries` / `conversation_messages` / `suggestions`
      (add-project-context) before trusting those tables in production. Each has app-layer
      isolation tests, but the DB policies themselves are unproven end-to-end.

### 3. Walk the money-critical flows live (phone width)
- [ ] Tenancy: sign-in → create-business → add a project; list is business-scoped.
- [ ] Onboarding: create-business → 3-step wizard → Review shows derived rates → edit in
      Settings and confirm the rates recompute.
- [ ] Reference-business check: $60k overhead, $35/hr wage, 25% burden, 200 days × 6
      billable hrs/day, $90k income, $15k profit → Review shows $50.00/hr recovery,
      $43.75/hr burdened, $93.75/hr loaded, $562.50 break-even day, $165,000 gross-profit
      goal, $87.50/hr target profit/hr. (Conversion math is unit-tested; this confirms the
      live render.)
- [ ] Estimate + dashboard: open a project → new estimate → add labor + material lines →
      margin-solve to 45% → green signal → mark active → dashboard shows the job's % of
      year and % of profit goal, worst-first.

### 4. Production hosting (later — roadmap launch pass)
- [ ] Vercel project + env vars.
- [ ] Production Supabase (separate from dev); apply all migrations there.
- [ ] Confirm middleware session refresh + auth redirects on the deployed domain.

## Future direction (north-star)

- **Visual tool-graph editor** *(2026-07-22)* — a later feature: a canvas where tools are
  nodes and connections are edges, so one tool's output feeds another's input and auto-triggers
  (photo upload → Code Finder) are drawn, not coded. Meta/admin surface first, power-user
  contractors later; lands **after the v1 tools ship**. It changes none of the tool rules
  (read-only snapshot in, suggestions out). **Guardrail for whoever builds the tool platform
  (#6):** keep every tool's `inputSchema`/`outputSchema` typed and side-effect-free (suggestions
  only, no hidden writes) so tools stay wirable later — but don't build the graph now. See
  constitution §5 "Composing tools", techstack §4, PROGRESS #10.

## Gotchas & lessons

- **OpenSpec CLI package** — the CLI is `@fission-ai/openspec` (`npm i -g @fission-ai/openspec`,
  provides the `openspec` bin). The bare `openspec` on npm is a dead 0.0.0 placeholder with
  no bin — don't install it. *(2026-07-22)*
- **`tsconfig.json` is Next-owned** — `next build` **mandates** `jsx: react-jsx`, adds
  `.next/dev/types/**/*.ts` to `include`, and sets `exclude: ["node_modules"]`, rewriting the
  file every build. These are committed as-is; don't fight them (an earlier note said to
  revert — that was wrong; the build just re-applies them). Everything typechecks under either
  `jsx` setting. *(updated 2026-07-22)*
- **No `.js` extensions on relative imports in `src/`** — the project uses
  `moduleResolution: "Bundler"`, where extensionless imports are idiomatic and Turbopack (the
  Next 16 build) resolves `./x` → `./x.ts` natively. Explicit `./x.js` specifiers (a NodeNext
  habit) make `next build` fail with "Module not found". Write `from "./x"`, not `"./x.js"`.
  tsc and vitest resolve both, so only a build catches it — run `npm run build` when touching
  imports under `src/`. *(2026-07-22)*
- **Zod + `tsc` OOM** — deeply-chained `z.union([...]).transform(...)` composed across many
  object fields (then a second object-level `.transform`) blew up `tsc --noEmit` (out of
  memory). Prefer plain, unit-tested converter functions for money/percent parsing over
  transform-heavy Zod schemas; validate shape with Zod, convert with helpers. See
  `src/db/validation.ts` (`parseSettingsForm`). *(2026-07-22)*

## Conventions worth remembering

- Money = integer cents (`*_cents`, stored `bigint` mode number), time = integer minutes,
  percentages = basis points. Convert human input at the Zod/parse boundary; never store a
  derived value — recompute via `src/engine/` (constitution §3.1, §6.8).
- Every business-owned table: non-null `business_id` + RLS enabled in the **same** migration
  + an in-memory tenant-isolation test + (eventually) a `test:rls` contract.
- New OpenSpec change that defers work to live infra: add its items to the
  "Deferred to live infrastructure" section above.
