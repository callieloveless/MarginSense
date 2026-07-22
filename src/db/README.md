# `src/db/` — Drizzle schema, migrations, tenant-scoped queries

The data plane. See [`constitution.md` §6.3/§6.4](../../constitution.md) and
[`techstack.md` §3](../../techstack.md).

- Every business-owned table has a non-null `business_id`. **Row-Level Security is on**;
  policies restrict every row to its business. The DB is the guarantee of tenant
  isolation — the UI filtering it too, but a missing tenant filter is a security incident.
- All tenant-scoped access goes through helpers here that **require** a `business_id`.
  Never write a raw query that could span tenants.
- Money columns are integer cents, time columns integer minutes, percentages basis points.
  Column names make the unit explicit (`*_cents`, `*_minutes`, `*_bp`). Timestamps in UTC.
- Migrations are **forward-only**, one reviewed file per change, generated and applied
  through Drizzle. No editing production schema by hand.

## Layout

| File | Role |
|---|---|
| `schema.ts` | Drizzle tables — the tenant spine (`businesses`, `users`, `projects`). Schema only. |
| `tenant.ts` | `TenantDb` + the `ProjectBackend` port. Obtaining a handle **requires** a `business_id`; the in-memory backend backs the isolation tests. |
| `rls.ts` | `withAuthenticatedTx` — runs each tenant query in a transaction that drops to the `authenticated` role and sets `auth.uid()`, so RLS is actually enforced. |
| `drizzle-backend.ts` | Production backend: SQL that filters/stamps by `business_id`, run inside the RLS context. Bound to the signed-in user. |
| `client.ts` | Lazy live connection (Drizzle over postgres.js, `prepare:false` for the pooler). Throws if `DATABASE_URL` is unset — importing it does not connect. |
| `auth.ts` | `resolveBusinessId(session)` — session identity → business, server-side only. |
| `validation.ts` | Zod boundary schemas for tenant-spine input. |
| `migrations/` | Forward-only SQL (schema **and** RLS policies, versioned together). |

## The two isolation layers

1. **Application layer** — `TenantDb` is bound to one `business_id` at construction and
   never exposes a cross-tenant path; `tenant.test.ts` proves it with an in-memory
   backend (no infra needed).
2. **Database layer (the guarantee)** — RLS policies in `migrations/0000` restrict every
   row to `public.current_business_id()`, resolved from `auth.uid()` via `users`.
   `tenant.rls.test.ts` (opt-in `npm run test:rls`) proves it against a live database.

For layer 2 to actually bite over a Drizzle connection, every tenant query runs inside
`withAuthenticatedTx` (`rls.ts`): a transaction that (a) sets `request.jwt.claims.sub` to
the server-verified user id so `auth.uid()` resolves, and (b) `SET LOCAL ROLE
authenticated` so the policies apply (the pooler login role would otherwise own the tables
and bypass RLS). Both are transaction-local — correct under the pooler's transaction mode.

Later business-owned tables copy this exact pattern: non-null `business_id`, a
`*_same_business` policy, all access through `withAuthenticatedTx`, and an isolation test.

## Environment & the connection role

Set `DATABASE_URL` (see [`.env.example`](../../.env.example)) to the Supabase **transaction
pooler** string (user `postgres.<ref>`, host `...pooler.supabase.com`, port `6543`). The
app logs in through the pooler and then, per request, `withAuthenticatedTx` drops to the
`authenticated` role and sets the caller's identity — so RLS is enforced even though the
login role itself could bypass it. `db:migrate` runs as the same role but as the schema
**owner** (no role switch), which is correct: migrations create tables, grants, and
policies.

Because enforcement depends on that per-transaction role switch, the rule is structural:
**all tenant data access goes through `withAuthenticatedTx`**, and feature code never gets
the raw connection. The only deliberately privileged path is `public.create_business(...)`
(a `SECURITY DEFINER` function, invoked via Supabase RPC) which bootstraps the first
business + user for a new auth identity — the one moment the caller has no business yet.

## Commands

```bash
npm run db:generate   # drizzle-kit: regenerate migration from schema changes
npm run db:migrate    # apply forward-only migrations (needs DATABASE_URL)
npm run test          # unit tests incl. helper-layer isolation (no infra)
npm run test:rls      # opt-in: prove RLS against a live database
```
