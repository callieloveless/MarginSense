# Design — tool dispatch seam, run lifecycle, dormant triggers

## Context

Change #6 shipped a tool platform whose `tool_run` is append-only (written after completion),
whose only invocation path is a direct `runTool` call from one server action, and whose
`source: "auto"` field has nothing that fires it. Before four tools (#7–#10) and the graph
editor (#12) harden around that shape, this change reshapes the three foundations they all
lean on — run observability, a single invocation seam, and event triggering — while
deliberately *not* building background infrastructure that has no consumer until #9.

The governing judgment: **the seam is cheap now and expensive later; the infra is premature
now and has exactly one clear trigger later.** So we build the seam and mark the trigger.

## Goals / Non-Goals

**Goals**
- A `tool_run` that is observable in flight (created running → finalized `ok`/`error`), whose
  terminal row remains the cost audit.
- One `dispatch(request)` entry point every invocation flows through (user / auto / compose),
  shaped so a queue driver can replace inline execution without touching callers.
- A dormant `emit(event)` → subscribed-tools registry (data, not code) — the #12 substrate —
  bounded by tenant scope and the step budget.
- Refactor `runTool` onto lifecycle ports with unchanged dedup / linked-emission behavior.

**Non-Goals**
- No queue/worker/background function (inline now; #9 brings async behind this seam).
- No trigger subscribers (registry empty); no new tool, no live model calls, no UI beyond
  re-pointing the existing action.

## Decisions

### Run lifecycle without an enum-value migration
`tool_runs.status` becomes **nullable**: `null` = running, set to `ok`/`error` at completion.
A run also gets a nullable `completed_at`; `created_at` is the start. Deriving state in code
(`runStatus(row) = row.status ?? "running"`) keeps the label without adding a `running` enum
value — which sidesteps the Postgres "ALTER TYPE … ADD VALUE cannot run inside a transaction"
footgun and keeps migration `0005` a bulletproof `ALTER COLUMN status DROP NOT NULL` +
`ADD COLUMN completed_at`. No RLS change (the table already enforces per-business RLS from
`0004`). *Alternative rejected:* add a `running` enum value — cleaner label, but the
in-transaction ADD VALUE hazard isn't worth it for a value we derive trivially.

### Start-then-finalize (and the ordering fix)
The runner splits its one `recordToolRun` into two `TenantDb` calls:
- `startToolRun({ projectId, toolName, source })` → inserts a running row, returns its id.
- `completeToolRun(id, { status, inputTokens, outputTokens, latencyMs })` → finalizes it.

Because the run id now exists **before** any suggestion or message is written, the emissions
link to it immediately, and the status is set **after** the emissions succeed — so a run that
fails to persist its suggestions is finalized `error`, not left as a misleading `ok`. That is
the #6 code-review finding #3, resolved structurally rather than skipped.

### One dispatch seam
`dispatch(request, deps)` is the single invocation path:

```
dispatch({ toolName, projectId, input, source?, step? }, deps):
  tool = deps.registry.get(toolName)            // unknown → reject, no run
  enforce step budget for non-user sources
  run = await deps.ports.startToolRun(...)       // status running
  try:
    snapshot = await deps.buildSnapshot(projectId)   // app-layer glue, injected
    outcome  = runCore(tool, { input, snapshot, ai: deps.ai, source }, run.id, deps.ports)
    await deps.ports.completeToolRun(run.id, { status: "ok", ...usage, latencyMs })
    return outcome
  catch e:
    await deps.ports.completeToolRun(run.id, { status: "error", ...usage, latencyMs })
              .catch(() => {})                    // never mask the real error
    throw e
```

`deps` are injected (registry, lifecycle ports, `ai` port, and `buildSnapshot(projectId)` —
the app-layer roll-up glue). The runner core stays framework/DB-free and unit-testable with a
fake `deps`. The app-layer `dispatch` binding wires the session's `TenantDb` and the snapshot
assembler; the tools server action calls `dispatch` instead of `runTool`. Inline today; a
queue driver later wraps the `startToolRun → runCore → completeToolRun` body without changing
the `dispatch` signature or any caller.

### Dormant event→trigger registry
`TRIGGERS: Record<EventName, readonly string[]>` maps an event to the tool names it fires.
`emit(event, ctx, deps)` dispatches each subscriber with `source: "auto"` and
`step: (ctx.step ?? 0) + 1`:

```
emit("photo.uploaded", { projectId, input, step }, deps):
  for toolName of TRIGGERS["photo.uploaded"] ?? []:
    await dispatch({ toolName, projectId, input, source: "auto", step: step+1 }, deps)
```

Ships with `TRIGGERS = {}` (no subscribers) — dormant. It exists so #8 emits an event instead
of naming a tool, and #9 subscribes Code Finder by adding one entry. The step budget
(`MAX_TOOL_STEPS`, already in the runner) bounds any future chain so an auto-trigger can't loop
forever. Same-tenant by construction (every dispatch runs through the tenant-bound ports).

### Sync now, async behind the seam
`dispatch` awaits the run inline. #7's run form shows the action's `pending` state during the
wait — acceptable for a user-initiated run. The moment a run must outlive the request (an
auto-trigger with no user waiting — #9), the inline body is swapped for "enqueue a run request;
a worker drains it and calls `completeToolRun`." The lifecycle row is exactly what the worker
finalizes and what a UI polls, so async is a driver swap, not a re-plumb.

## Risks / Trade-offs

- [Reshaping `tool_run` three commits after building it] → intentional: decide before four
  tools ossify the append-only shape; the flip is one migration + one runner refactor now vs. a
  migration + four-tool rework at #9.
- [Nullable status weakens the audit query] → cost aggregation filters `status IS NOT NULL`
  (terminal runs only); `runStatus()` derives the label. Running rows are transient.
- [A dispatch that never finalizes leaks a running row] → the inline path always finalizes in a
  `try/finally`-style flow; when async lands, the worker owns finalization and stale-running
  reconciliation (a #9 concern, noted not built).
- [Dormant registry is dead code] → it's the seam #8/#9/#12 were going to need regardless;
  shipping it empty now is cheaper than retrofitting event emission into #8 later. A test
  asserts an empty registry makes `emit` a no-op.
- [Tenant leakage via a composed/auto hop] → every hop runs through the tenant-bound ports with
  `business_id` stamped from the handle; unchanged from #6.

## Migration Plan

Forward-only migration `0005`: `ALTER TABLE tool_runs ALTER COLUMN status DROP NOT NULL` and
`ADD COLUMN completed_at timestamptz`. Additive, no backfill (existing rows keep `status` set
and `completed_at` null — indistinguishable from "completed before this column existed," which
is fine for an audit).

## Open Questions

- **Stale running rows** (a process dies mid-run) — reconciliation belongs with the async
  worker (#9); inline runs always finalize, so it's not a v1 concern.
- **Event payload shape** — `emit`'s `ctx.input` is passed to the subscriber as its tool input;
  the concrete event/payload contracts are defined by the tool that emits (#8) and the one that
  subscribes (#9). Here the seam is typed generically.
