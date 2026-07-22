# Add the tenancy & app foundation

## Why

Every proposed change ahead of us — onboarding, estimates, the dashboard, every Tool —
presumes the domain spine **Business → Project → Estimate** and tenant isolation
**enforced in the database** (constitution §2, §6.3). None of that exists yet: the repo
has the pure profit engine and README scaffolding, no Next.js app, no schema, no auth,
no RLS. `add-onboarding` cannot write a `business_settings` row with a "non-null
`business_id`" when there is no `businesses` table and no way to know who the signed-in
business is.

For the contractor this is invisible plumbing — but it is the plumbing that makes "your
data is yours" true (a licensed contractor's client addresses, photos of homes, and
pricing are confidential, constitution §7), and it is the ground onboarding and the
estimate builder stand on. Getting the tenancy wrong later means migrating live customer
data; getting it right first costs one change.

## What Changes

- **Next.js (App Router) skeleton**, phone-first: the `(auth)` group (sign-in; onboarding
  lives here later), the `(app)` authenticated shell (dashboard, projects list,
  `projects/[id]`, settings — stub screens), and middleware that keeps unauthenticated
  users out of `(app)`.
- **Drizzle + Postgres (Supabase) wiring**: typed schema in `src/db/`, forward-only
  migration setup (constitution §6.4), env-based connection (secrets never in the repo).
- **Core tables**: `businesses` (the tenant: name, trade type), `users` (maps an auth
  identity to exactly one business), `projects` (one client job: client name, address,
  scope, status). Every business-owned row carries a non-null `business_id`; money/time
  columns (none yet beyond audit timestamps) follow the `*_cents`/`*_minutes`/`*_bp`
  naming when they arrive.
- **Row-Level Security on from the first migration**: policies restrict every
  business-owned row to its business, keyed off the authenticated user's business. The
  DB is the guarantee; the UI merely also filters.
- **Tenant-scoped query helpers** in `src/db/`: every read/write requires a
  `business_id`; there is no exported raw-query path that could span tenants.
- **Supabase Auth integration**: sessions scoped to one business; a signed-in user
  resolves to their `business_id` server-side (never trusted from the client).
- **Tenant-isolation tests**: explicit proof that one business cannot read or write
  another's rows, at both the helper layer and (when live infra is attached) the RLS
  layer.

## Capabilities

### New Capabilities

- `tenancy-foundation` — the tenant model (businesses, users, projects), DB-enforced
  isolation, tenant-scoped data access, auth session → business resolution, and the
  authenticated app shell.

### Modified Capabilities

- None. `profit-engine` is untouched (it remains pure and imports nothing from this).

## Impact

- **New code:** `app/` route groups and stub screens; `src/db/` (Drizzle schema,
  migrations, tenant-scoped helpers, RLS policy SQL); `src/db/` auth-session resolution;
  Zod schemas for project/business input; Vitest tenant-isolation tests.
- **New dependencies:** `next`, `react`, `drizzle-orm` + `drizzle-kit`,
  `@supabase/supabase-js` + `@supabase/ssr`, `zod`, `postgres` (driver), Tailwind CSS.
- **Feeds:** `add-onboarding` (writes `business_settings` against `businesses`),
  `add-estimate-dashboard` (writes `estimates`/`line_items` against `projects`), and the
  future context/tools changes (all context tables hang off `projects`).
- **Tenant isolation:** this change *is* the tenant-isolation rule made real
  (constitution §6.3); its tests become the pattern every later table copies.
- **Financial model / tool contract:** untouched. No math outside `src/engine/`; no
  tools yet.

## Non-goals

- No onboarding wizard, business-settings capture, or Review screen — that is
  `add-onboarding`.
- No estimates, line items, or dashboard math surfaces — that is
  `add-estimate-dashboard`.
- No shared context, conversation, suggestions, or tools — later changes.
- No multi-business membership; one user belongs to exactly one business (constitution
  §2; modeled so crews can come later).
- No production deployment; live Supabase project + secrets are wired by the owner when
  ready. Everything here is buildable and testable without them.
