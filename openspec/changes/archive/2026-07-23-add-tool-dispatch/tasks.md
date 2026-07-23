# Tasks — add-tool-dispatch

## 1. Run lifecycle persistence

- [x] 1.1 Schema: `tool_runs.status` → nullable (null = running); add nullable `completed_at`.
      Update `ToolRunRow` types; add a `runStatus(row) = row.status ?? "running"` helper.
- [x] 1.2 `npm run db:generate` → migration `0005` (`ALTER COLUMN status DROP NOT NULL` +
      `ADD COLUMN completed_at`); confirm both statements; no RLS change needed (0004's policy
      already covers the table).
- [x] 1.3 `ToolRunsBackend`: replace `insert` usage with `startRun` (insert running) +
      `finalizeRun(businessId, id, patch)` (update status/tokens/latency/completed_at). Memory
      + Drizzle impls.
- [x] 1.4 `TenantDb`: `recordToolRun` → `startToolRun({projectId, toolName, source})` +
      `completeToolRun(id, {status, inputTokens, outputTokens, latencyMs})`, both stamping
      `business_id` from the handle; `listToolRuns` unchanged.
- [x] 1.5 Update the tool-runs isolation test for the lifecycle (start → complete; cross-tenant
      read/finalize blocked; business_id from the handle).

## 2. Dispatch seam + runner refactor (`src/tools/`)

- [x] 2.1 Define `DispatchRequest = { toolName, projectId, input, source?, step? }` and
      `DispatchDeps = { registry, ports (startToolRun/completeToolRun/listPending/
      createSuggestion/postMessage), ai, buildSnapshot(projectId) }`.
- [x] 2.2 `dispatch(request, deps)`: resolve tool (unknown → reject, no run) → enforce step
      budget for non-`user` sources → `startToolRun` → run core (validate input → snapshot via
      deps.buildSnapshot → run → validate output + proposals → dedupe → create pending +
      linked post) → `completeToolRun(ok)`; on error `completeToolRun(error).catch(()=>{})`
      then rethrow. Runner core stays framework/DB-free.
- [x] 2.3 Refactor `runTool` into the dispatch core (lifecycle ports); keep dedup, linked
      suggestions/post, and the read-only boundary intact.
- [x] 2.4 Trigger registry `TRIGGERS: Record<string, readonly string[]>` (ships empty) +
      `emit(event, ctx, deps)` dispatching each subscriber with `source:"auto"`,
      `step: (ctx.step??0)+1`.
- [x] 2.5 Unit tests: dispatch starts+finalizes a run; unknown tool → no run; error path
      finalizes `error` and doesn't mask the real error; emissions link to the run id; `emit`
      with empty registry is a no-op; step budget refuses over-deep auto/compose dispatch.

## 3. App wiring

- [x] 3.1 `app/_lib/tool-runner.ts`: adapter exposes the lifecycle ports + `buildSnapshot`
      binding over `TenantDb` + the snapshot assembler; provide a `dispatchForSession(...)`
      helper.
- [x] 3.2 Re-point `app/(app)/projects/[id]/tools/actions.ts` at `dispatch` (source `user`);
      behavior unchanged for the reference tool (still emits a pending suggestion + post).

## 4. Verification

- [x] 4.1 `npm run typecheck`, full Vitest suite, and `npm run build` green.
- [x] 4.2 `src/tools/` stays framework/DB-free (persists only through injected ports); `src/`
      relative imports extensionless; no queue/background infra introduced.
- [x] 4.3 Dispatch is the only tool-invocation path; the trigger registry ships empty and
      `emit` is a proven no-op; lifecycle finalization is asserted for ok and error.
- [x] 4.4 `openspec validate add-tool-dispatch --strict` passes.

## Deferred to live infra (owner provisions Supabase)

- [ ] Apply migration `0005` (`npm run db:migrate`).
- [ ] Re-run `tool_runs` RLS proof (`npm run test:rls`) for the lifecycle columns.
- [ ] (At #9) Swap dispatch's inline drain for a queue/worker so auto-triggered runs outlive
      the request; add stale-running reconciliation.
