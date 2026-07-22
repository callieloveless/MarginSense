# Tasks — add-project-context

## 1. Persistence (tenant-scoped)

- [x] 1.1 Add `context_entries` (project_id, kind enum `finding|material|code_ref|photo|fact`,
      JSON payload, author, `business_id`), `conversation_messages` (project_id, author, body,
      `business_id`), and `suggestions` (project_id, status enum `pending|accepted|dismissed`,
      target kind enum, payload, resolution, `business_id`) tables via Drizzle
- [x] 1.2 Enable RLS; per-business policies + `authenticated` grants in the same migration
- [x] 1.3 Tenant-scoped `src/db/` helpers (add/list entries, post/list messages, create/list
      pending/accept/dismiss suggestions) requiring `business_id`; each via the `TenantDb` seam
- [x] 1.4 Tenant-isolation tests on all three tables (cross-tenant read blocked; cross-tenant
      accept blocked; author/business stamped from the handle, never input)
- [x] 1.5 Forward-only migration (0003)

## 2. Context module (`src/context/`)

- [x] 2.1 Zod-typed payloads for each entry kind and each suggestion target; parsed in and out,
      never `any`
- [x] 2.2 `author` union (`user` | `{ tool }`) and the message/attribution types
- [x] 2.3 `nextStatus(...)` — pure accept/dismiss state machine: pending → accepted (with the
      effect derived by `suggestionEffect`) or dismissed; non-pending is an idempotent no-op
- [x] 2.4 `buildProjectSnapshot(...)` — assemble a frozen, read-only view (entries +
      conversation + active-estimate roll-up via the engine); expose no write path
- [x] 2.5 Unit tests: payload validation, state machine transitions/idempotency, snapshot is
      read-only and carries the active roll-up

## 3. Accept path + estimate seam

- [x] 3.1 Server-side accept: perform the suggestion's effect (commit a `context_entry`, or add
      a line item to the target estimate) AND flip status in one tenant-scoped transaction;
      dismiss commits nothing
- [x] 3.2 Dismissed suggestions are excluded from the pending queue (remembered, never re-nag)
- [x] 3.3 Estimate-creation seam: seed a `fact` entry when the first estimate is created
      (one-way flow, constitution §4)

## 4. UI (phone-first)

- [x] 4.1 Project-context view under `app/(app)/projects/[id]/context`: context entries list
      (by kind) and the single conversation thread with a post form
- [x] 4.2 Pending suggestions with Accept / Dismiss wired to the server accept path; revalidated
      on action; built at phone width
- [x] 4.3 Plain language; any number comes from the engine (`formatCents`); no color-only cues

## 5. Verification

- [x] 5.1 `npm run typecheck`, full Vitest suite (132), and `npm run build` green
- [x] 5.2 Read-only snapshot exposes no mutators (frozen; asserted in `context.test.ts`) and the
      only tool-return channel is a `Suggestion`
- [x] 5.3 `src/engine/` and `src/context/` stay framework/DB-free (context's only runtime import
      is Zod; engine/schema are type-only); no tool code yet
- [x] 5.4 Run `openspec validate add-project-context --strict` and confirm it passes

## Deferred to live infra (owner provisions Supabase + secrets)

- [ ] Apply the migration (0003) to the live database (`npm run db:migrate`)
- [ ] Prove `context_entries` / `conversation_messages` / `suggestions` RLS via `npm run test:rls`
- [ ] Walk it live: create estimate → context seeded → add a suggestion → accept/dismiss
