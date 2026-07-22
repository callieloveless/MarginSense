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

It is also shaped **on purpose** for what comes next — Material Finder's web search (#7),
Photo Advisor's vision (#8), Code Finder's auto-trigger (#9), the Client Estimate Doc's
document output (#10), and the composable tool-graph editor (#12) — so those changes extend
the platform instead of reworking it.

## What Changes

- **The tool contract** (techstack §4): every tool in `src/tools/*` exports the same
  shape — a Zod `inputSchema`, a Zod `outputSchema`, and a `run(ctx)` that receives the
  **read-only** project snapshot (context entries + conversation + active-estimate roll-up,
  from change #5), validated input, and the `src/ai/` model port. It returns a `ToolResult`
  with three separated parts:
  - **`output`** — the tool's typed, machine-readable result, validated against
    `outputSchema`. This is **read-only data** (findings, materials, search results), the
    payload a future tool-graph (#12) can route into a downstream tool's `input`. It is
    **not** a write path (see the safety invariants below).
  - **`suggestions`** — zero or more proposed changes (context entry, estimate line item,
    and — later — a document), each created `pending`. **This is the ONLY path that can
    commit anything**, and only when the user accepts (change #5's guarantee, unchanged).
  - **`message`** — an optional post to the single project conversation, attributed to the
    tool, with an optional **disclaimer** (so Photo Advisor / Code Finder attach the
    licensed-professional notice uniformly — §5, §7).
- **The tool registry** — a first-class, enumerable map of available tools (`name → Tool`).
  The project-page Tools surface, #9's photo-upload auto-trigger, and #12's graph editor all
  read one registry rather than hard-coding tool lists.
- **The tool runner** — the one code path that invokes a tool: validates input at the
  boundary → assembles the read-only snapshot → calls `run(ctx)` → validates the `output`
  and each proposed suggestion → **de-duplicates** (skips a proposed suggestion identical to
  one already `pending` for the project) → creates the rest as `pending` suggestions → posts
  the message → records a `tool_run` **linked to the suggestions and message it produced**.
  It has no path that commits an estimate or context fact directly.
- **`src/ai/` — a mockable model port, shaped for the real tools**: the single home for
  model IDs, effort/thinking defaults, and AI config (no magic constants elsewhere). The
  port's request already carries what #7–#9 need — a system prompt, a message list, optional
  **image** blocks (vision), and optional **server-tool** declarations (web search) — and its
  response carries content, **token usage**, and optional **citations**. A memory/mock
  implementation powers unit tests; a real Anthropic implementation sits behind
  `ANTHROPIC_API_KEY` (default judgment model `claude-opus-4-8`, adaptive thinking). Tools
  call the port, never the SDK. Shipping the full request/response shape now means #7–#9
  extend the port's *behavior*, not its *interface*.
- **`tool_run` cost logging + traceability**: every invocation records a tenant-scoped
  `tool_run` row (tool name, project, tokens, latency, status), including failed runs. A
  nullable `tool_run_id` on `suggestions` and `conversation_messages` links each emission
  back to the run (and its cost) that produced it — "every number is traceable" (§6.6).
- **The project-page Tools surface shell** + a trivial **reference/echo tool** that proves
  the whole path end-to-end (input → run → typed output → pending suggestion → conversation
  post → `tool_run` logged and linked) against the mock port, with no external dependency.
- **Live AI is deferred to live infra**: mirrors the Supabase/RLS deferral. Everything is
  built, typed, and unit-tested against the mock port now; real model calls wait on
  `ANTHROPIC_API_KEY`. The tasks end with an explicit stage to incorporate live AI once the
  key exists (tracked in `relevant_notes.md` §5).

### The typed-output side-channel — powerful, but fenced

The graph editor (#12) will route one tool's `output` into another's `input`. That is a real
data path, so this change makes it safe **by construction**, not by convention:

1. **Data-only, validated.** A routed `output` is validated against the producer's
   `outputSchema` and, on the way in, the consumer's `inputSchema`. It carries no write or
   commit capability — it is plain typed data.
2. **Never a commit path.** Composition can produce more suggestions, but the estimate and
   context still change **only** when the user accepts a suggestion. A graph can never yield
   an un-accepted estimate/context change (§5 holds across the whole graph).
3. **Same tenant, same project.** Every hop runs through the tenant-bound handle;
   `business_id` is stamped from the handle, never from input. A composed run cannot cross
   businesses or projects.
4. **Authored wiring, not self-rewiring.** The graph (which output feeds which input, which
   events auto-trigger) is stored, admin/user-authored config (#12). A tool cannot rewire
   itself or escalate its own permissions at runtime.
5. **Bounded.** Composed/auto-triggered execution carries a step budget so a graph cannot
   infinitely re-trigger (guardrail for #9's auto-trigger and #12).

This change ships items 1–3 (they live in the contract + runner). Items 4–5 are stated here
as the invariants #9/#12 must uphold; the graph itself is not built now.

## Capabilities

### New Capabilities
- `tool-platform` — the uniform tool contract (`inputSchema`/`outputSchema`/`run(ctx)` →
  typed `output` + `suggestions` + `message`), the tool registry, the tool runner
  (read-only snapshot in; validated output, de-duplicated suggestions, and a conversation
  post out; `tool_run` logged and linked), the `src/ai/` mockable model port with a
  tool-ready request/response shape and centralized config, `tool_run` cost logging with
  traceability, and the project-page Tools surface shell with a reference tool.

### Modified Capabilities
- None behaviorally. Consumes `project-context` (the read-only snapshot, the conversation,
  the suggestions queue) and adds a nullable `tool_run_id` link on its `suggestions` /
  `conversation_messages` rows (additive, backward-compatible); consumes `tenancy-foundation`
  (the `TenantDb` seam + RLS pattern for the new `tool_runs` table) and reads the `estimates`
  roll-up via the engine as part of the snapshot. It changes none of their requirements.

## Impact

- **New code:** Drizzle schema + migration `0004` — a `tool_runs` table (non-null
  `business_id`, RLS on, grants) plus nullable `tool_run_id` columns on `suggestions` and
  `conversation_messages` — with a `ToolRunsBackend` port (memory impl in `src/db/tenant.ts`,
  Drizzle impl in `src/db/drizzle-backend.ts`, wired in `src/db/session.ts`) and a
  tenant-isolation test; `src/ai/` (config + model port with mock and Anthropic impls,
  `tool_run` recording); `src/tools/` (the contract types, the registry, the runner, and the
  reference tool), pure and framework/DB-free except through the injected ports; a
  project-page Tools UI shell under `app/(app)/projects/[id]/tools/`.
- **New dependency:** `@anthropic-ai/sdk` (used only inside the real `src/ai/` impl, behind
  the port; import-guarded so the mock path builds without it).
- **Depends on:** `project-context` (snapshot, conversation, suggestions), `tenancy-foundation`
  (tenant access + RLS), `estimates` (roll-up in the snapshot).
- **Feeds:** every tool change — Material Finder (#7), Photo Advisor (#8), Code Finder (#9),
  Client Estimate Doc (#10) each add one `src/tools/*` module on this contract; the tool-graph
  editor (#12) routes typed `output` between registered tools under the fences above.

## Non-goals

- **No real user-facing tool** — Material Finder and the rest are their own changes. The
  only tool here is the reference/echo tool that proves the platform.
- **No web search, vision, photo upload, or auto-triggers executed** — the port *declares*
  the request shapes (images, server tools) so tools don't reshape it, but actually running
  web search (#7), vision (#8), upload/storage (#8), and the first auto-trigger (#9) arrive
  with the tools that need them.
- **No live model calls in this change's acceptance** — the platform is proven against the
  mock port; live AI is a deferred, key-gated stage.
- **No tool-graph editor and no `document` suggestion target** — the contract stays typed and
  the output side-channel stays fenced so the graph is *possible* later; neither the graph UI
  nor the `document` target is built now.
- **No new financial math** — any number in the snapshot comes from `src/engine/`.
