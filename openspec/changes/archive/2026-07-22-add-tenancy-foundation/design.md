# Design — tenancy & app foundation

## Context

This is the first change that touches infrastructure: the Next.js app, the database, and
auth. It establishes the patterns every later change copies — the tenant-scoped helper
shape, the RLS policy shape, the migration workflow, and the route-group layout. The
constitution fixes the domain spine (§2) and DB-enforced isolation (§6.3); this design
decides *how* those land in the Supabase + Drizzle + Next.js stack (techstack §1–§3).

Constraint: no live Supabase project or secrets exist yet. The design must make
everything buildable and unit-testable now, with live infra attachable later without
rework.

## Goals / Non-Goals

**Goals**

- The Business → Project spine in real tables, RLS on from the first migration.
- One pattern for tenant-scoped data access that later tables copy verbatim.
- Auth session → `business_id` resolution done once, server-side, and reused everywhere.
- An app shell (route groups, middleware, stub screens) other changes fill in.
- Tenant-isolation tests that run without live infra (helper layer) plus RLS tests that
  run when infra is attached.

**Non-Goals**

- No feature UI (onboarding, estimates, dashboard content).
- No `business_settings`, `estimates`, `line_items`, or context tables — later changes
  add them *using this change's patterns*.
- No crew/multi-user-per-business flows beyond the schema leaving room.

## Decisions

- **Two-layer isolation: helpers first, RLS as the guarantee.** All application code
  goes through `src/db/` helpers that take a `TenantDb` — a query handle already bound
  to a `business_id`. Getting a `TenantDb` requires a `business_id`; no helper accepts
  an unscoped connection. RLS policies on every business-owned table are the backstop
  the constitution demands (§6.3): even a bug in a helper cannot cross tenants once the
  session's business claim is set. *Alternative:* trusting RLS alone — rejected because
  unit tests should catch cross-tenant bugs without a live Postgres, and defense in
  depth is cheap here.
- **RLS keys off the authenticated user's business, resolved via the `users` table.**
  Policy shape: `business_id = public.current_business_id()`, where
  `current_business_id()` reads `business_id from users where auth_id = auth.uid()`. The
  client never supplies `business_id`; the server resolves it from the session. Supabase's
  `auth.uid()` is the only external input the policies trust.
- **`auth.uid()` is made real over Drizzle by a per-request transaction context.** The app
  reaches Postgres through the Supabase pooler as a single login role, so on its own
  `auth.uid()` is null and the login role (which owns the tables) would bypass RLS
  entirely. `withAuthenticatedTx` (`src/db/rls.ts`) wraps every tenant query in a
  transaction that (a) sets `request.jwt.claims.sub` to the *server-verified* user id so
  `auth.uid()` resolves, and (b) `SET LOCAL ROLE authenticated` so the policies apply.
  Both are `SET LOCAL` (transaction-scoped) — the only session-safe option under the
  pooler's transaction mode. *Alternative:* `ALTER TABLE … FORCE ROW LEVEL SECURITY` so
  even the owner is subject to RLS — rejected because it also blocks the `create_business`
  `SECURITY DEFINER` bootstrap (which must insert before the user has a business); the
  role-switch keeps the guarantee without breaking bootstrap. *Alternative:* routing all
  reads through Supabase PostgREST instead of Drizzle — rejected to keep queries typed and
  in one data layer. This keeps the constitution's DB-enforced-isolation guarantee (§6.3)
  intact; it changes only the mechanism, so no amendment is needed.
- **`users.auth_id` maps a Supabase Auth identity to exactly one business.** One row per
  user, unique `auth_id`, non-null `business_id`. Solo today; a future crews change can
  relax cardinality without breaking the policy shape.
- **Sign-up creates the business.** First sign-in with no `users` row routes to a
  minimal create-business step (name + trade type only — *not* onboarding; the financial
  wizard is `add-onboarding` and slots in right after). This is the only path that
  inserts a `businesses` row.
- **Drizzle owns schema + migrations; RLS lives in hand-written SQL inside the same
  migration files.** Drizzle-kit generates DDL; we append `alter table … enable row
  level security` and `create policy …` statements to the generated migration so RLS
  and schema are versioned together, forward-only (§6.4). *Alternative:* managing
  policies in the Supabase dashboard — rejected: unversioned, hand-edited production
  schema is exactly what §6.4 forbids.
- **Driver split: `postgres` (postgres.js) for app queries via Drizzle;
  `@supabase/ssr` only for auth/session.** Data access does not go through Supabase's
  PostgREST — Drizzle talks to Postgres directly, keeping queries typed and testable.
  Supabase supplies auth, storage (later), and the hosted Postgres itself.
- **Helper-layer tests run against an in-memory fake; RLS tests are opt-in against a
  real database.** The `TenantDb` seam lets Vitest prove helper-level isolation (a
  helper bound to business A cannot touch B's rows) with no infra. A separate
  `test:rls` suite (skipped unless `DATABASE_URL` is set) proves the policies
  themselves. Both are constitutional tests (§6.3, techstack §5).
- **Route groups per techstack §2:** `(auth)` for sign-in/create-business, `(app)` for
  the authenticated shell with dashboard / projects / `projects/[id]` / settings stubs.
  Middleware refreshes the Supabase session and redirects signed-out users to sign-in.
  Server components by default; no client component is needed in this change.
- **Projects are deliberately thin:** client name, address, scope note, status
  (`active | complete | archived`). Estimates, context, and conversation attach to
  projects in later changes; this change only needs the spine to exist.

## Risks / Trade-offs

- [No live infra to prove RLS now] → policies ship in migrations + an opt-in `test:rls`
  suite; helper-layer tests give day-one coverage. Attaching Supabase later is config,
  not rework.
- [RLS policy correctness is subtle] → one policy shape used for every table, written
  once, reviewed here; later tables copy it verbatim rather than inventing variants.
- [postgres.js + RLS requires the right role] → app connects with a role that is
  subject to RLS (not the `postgres` superuser role) in production; documented in
  `src/db/README.md` env setup.
- [Auth flows are hard to unit test] → session → `business_id` resolution is one small
  function with a fake-able Supabase client; e2e coverage arrives with the first real
  feature flows.

## Migration Plan

Migration `0000` (forward-only): create `businesses`, `users`, `projects`; enable RLS on
all three; create the per-business policies; add `updated_at` triggers. Additive; no
existing data. Applied to the live Supabase project when it exists.

## Open Questions

- Whether create-business at first sign-in should be folded into `add-onboarding`'s
  wizard step 1 once that ships (leaning: yes — this change's minimal step is a
  placeholder the wizard replaces).
- Supabase project provisioning (region, plan) — owner decision, blocks only the live
  attach, not this change.
