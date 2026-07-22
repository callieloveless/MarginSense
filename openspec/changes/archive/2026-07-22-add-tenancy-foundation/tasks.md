# Tasks — add-tenancy-foundation

## 1. Stack wiring

- [x] 1.1 Install and configure the app stack: `next`, `react`, `react-dom`, Tailwind,
      `zod`; keep `src/engine/` free of any new imports
- [x] 1.2 Install the data stack: `drizzle-orm`, `drizzle-kit`, `postgres`,
      `@supabase/supabase-js`, `@supabase/ssr`; add `drizzle.config.ts` and env handling
      (`.env.example` documenting required secrets; nothing secret in the repo)
- [x] 1.3 Wire scripts: `dev`, `build`, `db:generate`, `db:migrate`, `test`, `test:rls`
      (opt-in, skipped without `DATABASE_URL`), `typecheck`

## 2. Schema & RLS (the tenant spine)

- [x] 2.1 Drizzle schema for `businesses` (id, name, trade type, timestamps)
- [x] 2.2 Drizzle schema for `users` (id, unique `auth_id`, non-null `business_id`,
      timestamps) — one user, one business
- [x] 2.3 Drizzle schema for `projects` (id, non-null `business_id`, client name, address,
      scope, status `active|complete|archived`, timestamps)
- [x] 2.4 Generate migration `0000` and append RLS: enable row level security on all
      three tables + one per-business policy shape keyed on `auth.uid()` → `users`
- [x] 2.5 Document the RLS-subject connection role and env setup in `src/db/README.md`

## 3. Tenant-scoped data access

- [x] 3.1 Implement the `TenantDb` seam: constructing a query handle requires a
      `business_id`; no unscoped handle is exported
- [x] 3.1a Implement `withAuthenticatedTx` (`rls.ts`): every tenant query runs in a
      transaction that sets `auth.uid()` from the verified session and `SET LOCAL ROLE
      authenticated`, so RLS is enforced over the pooled Drizzle connection; grant the
      `authenticated` role table/function privileges in the migration; unit-test the emitted
      identity/role SQL and the fail-closed path
- [x] 3.2 Tenant-scoped helpers: businesses (read own via session), projects (list / get /
      create / update status) — every helper takes the `TenantDb`, never a raw connection
- [x] 3.3 Zod boundary schemas for project and business input (create/update)
- [x] 3.4 Tenant-isolation tests (no infra needed): a handle bound to business A cannot
      read or write business B's projects; creation always stamps the bound
      `business_id`
- [ ] 3.5 Opt-in RLS tests (`test:rls`): with two seeded businesses and real sessions,
      prove the policies block cross-tenant reads and writes
      — *harness + contract written (`tenant.rls.test.ts`); proving it needs the live
      Supabase project*

## 4. Auth & session → business

- [x] 4.1 Supabase Auth client setup (`@supabase/ssr`) for server components, route
      handlers, and middleware
- [x] 4.2 `resolveBusinessId(session)`: map `auth.uid()` → `users.business_id`
      server-side; unit-tested with a faked client; never read from client input
- [x] 4.3 Middleware: refresh session; signed-out users hitting `(app)` redirect to
      sign-in; signed-in users without a `users` row route to create-business
- [x] 4.4 Minimal create-business flow (name + trade type) — the only `businesses`
      insert path; placeholder that `add-onboarding`'s wizard will absorb

## 5. App shell (phone-first)

- [x] 5.1 Root layout + Tailwind base; phone-width-first styles
- [x] 5.2 `(auth)` group: sign-in screen and create-business step
- [x] 5.3 `(app)` group shell with nav: dashboard, projects list, `projects/[id]`,
      settings — stub server components that render real session/tenant data (business
      name, project list) but no feature UI
- [x] 5.4 Projects list + create-project form wired through the tenant-scoped helpers

## 6. Verification

- [x] 6.1 `npm run typecheck` and full Vitest suite green (engine tests still pass;
      isolation tests pass)
- [x] 6.2 Confirm `src/engine/` still imports nothing from Next/React/Drizzle/Supabase
- [x] 6.3 Run `openspec validate add-tenancy-foundation --strict` and confirm it passes

## Deferred to live infra (owner provisions Supabase + secrets)

- [ ] Apply migration `0000` to the live database (`npm run db:migrate`)
- [ ] Prove RLS end-to-end via `npm run test:rls`
- [ ] Walk the money-critical flow start (sign-in → create-business → add project) live
