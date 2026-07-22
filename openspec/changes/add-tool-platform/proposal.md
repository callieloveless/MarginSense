# Add the tool platform — the tool contract and AI layer

## Why

`add-project-context` (change #5) built the substrate every Tool needs — the read-only
project snapshot, the one conversation, and the suggestions queue — but deliberately left
out the thing that turns that substrate into a working tool: a **uniform contract** for
what a tool is, and the **AI layer** it calls. Right now nothing can actually *run*: there
is no `src/tools/*` shape, no `src/ai/` to reach Claude, and no `tool_run` audit of what a
run cost. This change lays that platform down — and only that — so each real tool
(Material Finder first) is a small, self-contained change on top of it rather than
re-inventing the wiring. It makes the constitution's core safety rule (§5: a tool receives
a read-only snapshot and can only emit suggestions) **structural in code**: the contract
hands a tool read-only data and accepts only a `Suggestion` back, so "a tool wrote to the
estimate" is not a state the type system can reach.

## What Changes

- **The tool contract** (techstack §4): every tool in `src/tools/*` exports the same
  shape — a Zod `inputSchema` / `outputSchema` and a `run(ctx)` that receives the **read-only**
  project snapshot (context entries + conversation + active estimate roll-up, from change #5)
  plus validated input, and returns structured output. Typed and side-effect-free by
  construction, so tools stay wirable for the future tool-graph editor (constitution §5,
  "Composing tools") without building the graph now.
- **The tool runner**: the one code path that invokes a tool — validates input at the
  boundary, assembles the read-only snapshot, calls the tool's `run(ctx)`, turns its
  structured output into `pending` **suggestions** in the change #5 queue, and posts the
  run's result into the single project conversation attributed to the tool. It has no write
  path to an estimate or context fact; the only thing that leaves a run is a suggestion.
- **`src/ai/` — a mockable model port**: the single home for model IDs, thresholds, and AI
  config (no magic constants scattered elsewhere). A memory/mock implementation powers unit
  tests; a real Anthropic implementation sits behind `ANTHROPIC_API_KEY` (default
  judgment-heavy model `claude-opus-4-8`). Tools call the port, never the SDK directly.
- **`tool_run` cost logging**: every invocation records a tenant-scoped `tool_run` row
  (tool name, project, tokens, latency, status) through the `TenantDb` seam — a new
  business-owned table with non-null `business_id`, RLS on, and a tenant-isolation test.
- **The project-page Tools surface shell**: tools open from the **project page** (the unit
  that owns the shared context and conversation). This change ships the shell — a Tools area
  that lists available tools and opens one — plus a trivial **reference/echo tool** that
  proves the whole path end-to-end (input → run → suggestion → conversation post → `tool_run`
  logged) with no external dependency.
- **Live AI is deferred to live infra**: mirrors the Supabase/RLS deferral. Everything is
  built, typed, and unit-tested against the mock port now; real model calls wait on
  `ANTHROPIC_API_KEY`. The tasks end with an explicit stage to incorporate live AI once the
  key exists (tracked in `relevant_notes.md` §5).

## Capabilities

### New Capabilities
- `tool-platform` — the uniform tool contract (`inputSchema`/`outputSchema`/`run(ctx)`),
  the tool runner (read-only snapshot in, suggestions + a conversation post out), the
  `src/ai/` mockable model port with centralized config, `tool_run` cost logging, and the
  project-page Tools surface shell with a reference tool.

### Modified Capabilities
- None. Consumes `project-context` (the read-only snapshot, the conversation, the
  suggestions queue), `tenancy-foundation` (the `TenantDb` seam + RLS pattern for the new
  `tool_runs` table), and reads the `estimates` roll-up via the engine as part of the
  snapshot. It changes none of their requirements.

## Impact

- **New code:** Drizzle schema + migration for `tool_runs` (non-null `business_id`, RLS on,
  grants) with a `ToolRunsBackend` port (memory impl in `src/db/tenant.ts`, Drizzle impl in
  `src/db/drizzle-backend.ts`, wired in `src/db/session.ts`) and a tenant-isolation test;
  `src/ai/` (config + model port with mock and Anthropic impls, `tool_run` recording);
  `src/tools/` (the contract types, the runner, and the reference tool), pure and
  framework/DB-free except through the injected ports; a project-page Tools UI shell under
  `app/(app)/projects/[id]/tools/`.
- **New dependency:** `@anthropic-ai/sdk` (used only inside the real `src/ai/` impl, behind
  the port).
- **Depends on:** `project-context` (snapshot, conversation, suggestions), `tenancy-foundation`
  (tenant access + RLS), `estimates` (roll-up in the snapshot).
- **Feeds:** every tool change — Material Finder (#7), Photo Advisor (#8), Code Finder (#9),
  Client Estimate Doc (#10) each add one `src/tools/*` module and its UI on this contract.

## Non-goals

- **No real user-facing tool** — Material Finder and the rest are their own changes. The
  only tool here is the reference/echo tool that proves the platform.
- **No web search, vision, photo upload, or auto-triggers** — those arrive with the tools
  that need them (Material Finder brings server-side `web_search`; Photo Advisor brings
  upload + vision; Code Finder brings the first auto-trigger).
- **No live model calls in this change's acceptance** — the platform is proven against the
  mock port; live AI is a deferred, key-gated stage.
- **No tool-graph editor** — the contract stays typed and side-effect-free so the graph is
  *possible* later; it is not built now.
- **No new financial math and no new write path** — any number in the snapshot comes from
  `src/engine/`; the only thing a run can commit is an accepted suggestion, server-side
  (change #5's guarantee, unchanged).
