# Tasks — add-project-context

## 1. Persistence (tenant-scoped)

- [ ] 1.1 Add `context_entries` (project_id, kind enum `finding|material|code_ref|photo|fact`,
      JSON payload, author, `business_id`), `conversation_messages` (project_id, author, body,
      `business_id`), and `suggestions` (project_id, status enum `pending|accepted|dismissed`,
      target kind enum, payload, resolution, `business_id`) tables via Drizzle
- [ ] 1.2 Enable RLS; per-business policies + `authenticated` grants in the same migration
- [ ] 1.3 Tenant-scoped `src/db/` helpers (add/list entries, post/list messages, create/list
      pending/accept/dismiss suggestions) requiring `business_id`; each via the `TenantDb` seam
- [ ] 1.4 Tenant-isolation tests on all three tables (cross-tenant read blocked; cross-tenant
      accept blocked; author/business stamped from the handle, never input)
- [ ] 1.5 Forward-only migration

## 2. Context module (`src/context/`)

- [ ] 2.1 Zod-typed payloads for each entry kind and each suggestion target; parsed in and out,
      never `any`
- [ ] 2.2 `author` union (`user` | `{ tool }`) and the message/attribution types
- [ ] 2.3 `resolveSuggestion(suggestion, action)` — pure accept/dismiss state machine: pending →
      accepted (with the committed effect described) or dismissed; non-pending is idempotent
      no-op
- [ ] 2.4 `buildProjectSnapshot(...)` — assemble a frozen, read-only view (entries +
      conversation + active-estimate roll-up via the engine); expose no write path
- [ ] 2.5 Unit tests: payload validation, state machine transitions/idempotency, snapshot is
      read-only and carries the active roll-up

## 3. Accept path + estimate seam

- [ ] 3.1 Server-side accept: perform the suggestion's effect (commit a `context_entry`, or add
      a line item to the active estimate via the existing estimate helpers) AND flip status in
      one tenant-scoped transaction; dismiss commits nothing
- [ ] 3.2 Dismissed suggestions are excluded from the pending queue (remembered, never re-nag)
- [ ] 3.3 Estimate-creation seam: seed a `fact` entry with the job's cost/hour data when an
      estimate is created (one-way flow, constitution §4)

## 4. UI (phone-first)

- [ ] 4.1 Project-context view under `app/(app)/projects/[id]/`: context entries list (by kind)
      and the single conversation thread
- [ ] 4.2 Pending suggestions with Accept / Dismiss actions wired to the server accept path;
      accepted/dismissed reflected immediately; build/test at phone width first
- [ ] 4.3 Plain language; any number comes from the engine; colors (if any) paired with text

## 5. Verification

- [ ] 5.1 `npm run typecheck`, full Vitest suite, and `npm run build` green
- [ ] 5.2 Confirm the read-only snapshot exposes no mutators and the only tool-return channel is
      a `Suggestion` (seam test)
- [ ] 5.3 Confirm `src/engine/` and `src/context/` stay framework-free; no tool code yet
- [ ] 5.4 Run `openspec validate add-project-context --strict` and confirm it passes

## Deferred to live infra (owner provisions Supabase + secrets)

- [ ] Apply the migration to the live database (`npm run db:migrate`)
- [ ] Prove `context_entries` / `conversation_messages` / `suggestions` RLS via `npm run test:rls`
- [ ] Walk it live: create estimate → context seeded → add a suggestion → accept/dismiss
