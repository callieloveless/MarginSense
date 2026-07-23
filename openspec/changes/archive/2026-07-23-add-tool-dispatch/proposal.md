# Add the tool dispatch seam — run lifecycle, one entry point, dormant triggers

## Why

The tool platform (change #6) records a `tool_run` **only after a run finishes**, invokes a
tool through an ad-hoc direct call, and has no way to fire a tool on an **event**. That
compounds into debt the moment four real tools land: no in-flight state (so no "running…" UI —
a problem Material Finder's web search already has), no single invocation path (each tool would
wire its own; #9 and #12 would each bolt on a different mechanism), and nothing to fire tools
on events (so #8's photo upload would *call* Code Finder rather than *emit an event* it
subscribes to). This change reshapes those foundations **now, at one tool**, so #7–#12 extend
one mechanism instead of reworking four. It builds the **seam, not the infra**: runs execute
inline here — the queue that lets a run outlive its request arrives with the first tool that
needs it (#9).

## What Changes

- **`tool_run` becomes an observable lifecycle** instead of an append-after-completion log. A
  run is **created when it starts** (`status` null = running) and **finalized** to `ok` or
  `error` at completion, with a `completed_at`. Token/latency are set at completion. The
  terminal row is still the cost audit; the in-flight row is what a UI can observe. (This also
  resolves the #6 review's skipped finding: the run id exists before any suggestion/post is
  written, and its status is set *after* — so a run that fails to persist its emissions is
  marked `error`, never a misleading `ok`.)
- **One dispatch entry point.** Every tool invocation — a user tap, an event, or a chained
  tool — flows through a single `dispatch(request)` seam that resolves the tool from the
  registry, starts the run, executes it, and finalizes it. It routes by `source`
  (`user | auto | compose`) and enforces the step budget. Today it drains inline; the seam is
  shaped so a queue driver can replace the drainer **without touching any caller**.
- **A dormant event→trigger registry.** An `emit(event, ctx)` seam looks up the tools
  subscribed to an event in a registry (data, not code — the substrate the #12 graph editor
  will edit) and dispatches each with `source: "auto"`, bounded by the step budget. The
  registry ships **empty**: no tool subscribes yet. It exists so #8's photo upload can
  `emit("photo.uploaded", …)` rather than name a tool, and #9 registers Code Finder by adding
  one table entry.
- **The runner is refactored around dispatch.** `runTool`'s persistence split changes from
  `recordToolRun` (write-after) to `startToolRun` (create running) + `completeToolRun`
  (finalize) on the `TenantDb` seam; the dedup, linked-suggestion, and conversation-post
  behavior are unchanged. The `reference` tool and the Tools surface keep working.

## Capabilities

### Modified Capabilities
- `tool-platform` — the "tool runs are logged" requirement becomes a **run-lifecycle**
  requirement (created running → finalized `ok`/`error`, observable in-flight, terminal row is
  the audit). Adds a **single dispatch entry point** requirement and an **event-triggered runs**
  requirement (dormant registry, tenant- and budget-bounded). The tool contract, dedup,
  compose-safety, AI port, and Tools-surface requirements are unchanged.

## Impact

- **Changed code:** `src/db/schema.ts` + migration `0005` (`tool_runs.status` → nullable;
  add `completed_at`); `ToolRunsBackend` gains an update path (memory + Drizzle); `TenantDb`
  `recordToolRun` → `startToolRun` + `completeToolRun`; `src/tools/` — a `dispatch` seam and an
  `emit`/trigger registry, `runTool` refactored to lifecycle ports; `app/_lib/tool-runner.ts`
  and the tools server action re-pointed at `dispatch`; tests updated + added (lifecycle,
  dispatch, dormant-emit no-op, error-finalization).
- **No new dependency. No queue/background infra.** Runs execute inline; the seam is the
  deliverable.
- **Depends on:** `tool-platform` (#6), `tenancy-foundation` (the `TenantDb` seam + RLS).
- **Feeds:** #7 (a "running…" state for the run form), #8 (emits `photo.uploaded`), #9 (the
  first real trigger subscriber + the point where background execution becomes warranted),
  #12 (the trigger registry is its editable substrate).

## Non-goals

- **No queue, worker, or background function.** Runs are synchronous here; real async lands
  with #9, behind this seam.
- **No trigger subscribers.** The registry is empty and dormant; wiring `photo.uploaded →
  Code Finder` is #9's job.
- **No new tool, no real model calls, no UI beyond re-pointing the existing action** (the
  suggestion card + profit preview + run-in-place are change P2, `add-suggestion-preview`).
- **No new financial math and no new commit path** — dispatch still emits only `pending`
  suggestions + a conversation post; accept-to-commit (change #5) is unchanged.
