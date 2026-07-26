## 1. Schema + persistence (before UI)

- [x] 1.1 Add nullable columns to `projects` in `src/db/schema.ts` (`job_type` text, `crew_size`
  text, `start_window` text, `default_target_margin_bp` int, `default_contingency_bp` int); run
  `npm run db:generate` for the forward-only migration; confirm **no RLS block** is needed (the
  columns inherit the existing `projects` per-business policy).
- [x] 1.2 Thread the fields through `createProject` (row types + `tenant.ts`/`drizzle-backend.ts`
  input) and `projectInputSchema` (`src/db/validation.ts`) — optional, percentages → basis points at
  the boundary.
- [x] 1.3 **Isolation test:** extend the in-memory projects isolation test to write/read the new
  fields cross-tenant (blocked) and confirm `business_id` is stamped from the handle, never input;
  add the live `projects` fields to the deferred `test:rls` list.

## 2. Estimate seed precedence

- [x] 2.1 On estimate creation, seed `target_margin_bp` / `contingency_bp` from the project default
  when set, else the business default; unit-test both paths **and** that changing a project default
  later leaves an existing estimate's values untouched (seed, not link).

## 3. Two-step new-job wizard

- [x] 3.1 Replace the inline new-project form with a 2-step wizard on the shell primitives
  (`SteppedProgress`, chips for job type + crew, tokens): *Who & where* (client/address/type/scope)
  and *Money & schedule* (target margin/contingency/crew/start + an **informational** auto-run panel
  describing only the live photo→code automation — no rules-screen link).
- [x] 3.2 Wire the wizard to `createProjectAction`; on success land on the project page (the rich hub
  is the next change); phone-first, chips over typing.

## 4. Verify & isolation guard

- [x] 4.1 `npm run typecheck`, `npx vitest run`, `npm run build`; apply the migration to the live DB
  and prove the new fields are tenant-scoped; phone-width walk of create-job (incl. the minimal
  client-name-only path).
- [x] 4.2 Update `PROGRESS.md` R4 status (note the hub follows as `revamp-project-hub`).
