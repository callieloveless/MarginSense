# Design — the tool platform (contract, runner, AI port, cost logging)

## Context

Change #5 built the substrate every tool binds to: the read-only `ProjectSnapshot`, the one
conversation, and the suggestions queue with a server-side accept-only mutation path. What is
missing is the thing that *runs*: a uniform shape for what a tool **is**, the one code path that
**invokes** one safely, the **AI port** a tool calls, and the **`tool_run`** audit of what a run
cost. This change lays exactly that platform down — no real user-facing tool — so each tool
(#7–#10) is a small, self-contained module on the contract rather than re-inventing the wiring.

The constitution's core safety rule (§5: a tool receives a read-only snapshot and can only emit
suggestions) becomes **structural in the type system** here: the runner hands a tool read-only
data and accepts back only a value the runner itself turns into `pending` suggestions. "A tool
wrote to the estimate" is not a state the code can reach.

## Goals / Non-Goals

**Goals**
- One `Tool` contract — `inputSchema` / `outputSchema` (Zod) + `run(ctx)` — that every tool
  implements identically, typed and side-effect-free so tools stay wirable for the future
  tool-graph editor (constitution §5, "Composing tools") without building it now.
- One tool **runner**: validate input → assemble the read-only snapshot → `run(ctx)` → convert
  structured output into `pending` suggestions (change #5 queue) + one conversation post
  attributed to the tool → record a `tool_run`. The only thing that leaves a run is a suggestion.
- `src/ai/` — a **mockable model port**: the single home for model IDs / AI config; a mock impl
  powers unit tests, a real Anthropic impl sits behind `ANTHROPIC_API_KEY`. Tools call the port,
  never the SDK.
- `tool_run` cost logging as a tenant-scoped, RLS-on table with an isolation test.
- A project-page **Tools** surface shell + a trivial **reference/echo tool** proving the whole
  path end-to-end against the mock port.

**Non-Goals**
- No real tool (Material Finder etc. are their own changes); no web search, vision, photo upload,
  or auto-triggers; no live model calls in this change's acceptance (key-gated, deferred).
- No new financial math (numbers come from `src/engine/`); no new write path (accept stays the
  change #5 server-side guarantee, unchanged).
- No tool-graph editor — the contract stays typed so it is *possible* later, not built now.

## Decisions

- **The `Tool` contract is a plain typed object, not a class.** A tool is
  `{ name, title, inputSchema, outputSchema, run(ctx) }`. `run` is pure with respect to
  persistence: it receives `ctx = { snapshot: ProjectSnapshot, input, ai }` and returns a
  validated `ToolResult` — a set of **proposed** suggestions (reusing change #5's
  `proposedContextEntrySchema` / `proposedLineItemSchema` shapes) plus a conversation message
  body. It never sees a DB handle. *Alternative:* let tools return raw suggestions with status —
  rejected; status is the runner's to set (`pending`), so a tool cannot mint an `accepted` one.
- **The runner is the one impure path.** `runTool(tool, { projectId, input })` under a
  tenant-scoped handle: (1) `tool.inputSchema.parse(input)`; (2) build the snapshot from the
  tenant DB (entries + conversation + active-estimate roll-up via the engine — reuse
  `buildProjectSnapshot`); (3) `tool.run(ctx)`; (4) `tool.outputSchema.parse(result)`;
  (5) create each proposed suggestion as `pending` via the existing `createSuggestion` helper;
  (6) post one `tool`-authored message via `postMessage`; (7) record a `tool_run`. Steps 5–7 run
  through the tenant-bound handle, so a tool's output is committed only as pending suggestions —
  never a direct estimate/context write.
- **`src/ai/` is a port with two impls, config centralized.** `src/ai/config.ts` holds model IDs
  (`claude-opus-4-8` default) and AI settings — the one place, no scattered constants
  (constitution §6 / techstack §6). `ModelPort` exposes a minimal `complete(request)` that
  returns text + a `usage` (tokens) + latency. `createMockModelPort()` (deterministic, used in
  tests) and `createAnthropicModelPort()` (wraps `@anthropic-ai/sdk`, server-only, behind
  `ANTHROPIC_API_KEY`). When the key is absent the factory reports `unconfigured` and the real
  port is never constructed — mirroring the Supabase `getServerSession()` `unconfigured` state.
  The reference tool uses the mock port so the platform's acceptance needs no key.
- **`tool_run` is a business-owned table via the `TenantDb` seam.** Columns: `business_id`
  (non-null), `project_id`, `tool_name`, `status` (`ok | error`), `input_tokens`,
  `output_tokens`, `latency_ms`, `created_at`. New `ToolRunsBackend` port with a memory impl in
  `src/db/tenant.ts` (powers the isolation test) and a Drizzle impl in `drizzle-backend.ts`
  (inside `withAuthenticatedTx`), wired in `session.ts`. `business_id` is stamped from the bound
  handle, never from input. The runner records exactly one row per invocation (including on
  tool/`run` failure → `status = error`).
- **The reference/echo tool proves the wiring with no external dependency.** `reference` (a.k.a.
  echo) takes `{ note: string }`, reads the snapshot (e.g. counts entries), asks the **mock**
  model port to produce a one-line summary, and returns one proposed `fact` context-entry
  suggestion + a conversation post. Running it end-to-end yields: input validated → snapshot in →
  a `pending` `fact` suggestion in the queue → one `tool`-authored conversation message → one
  `tool_run` logged. Accepting that suggestion goes through change #5's unchanged accept path.
- **Tools open from the project page.** A `Tools` area under
  `app/(app)/projects/[id]/tools/` lists the available tools and opens one; running the reference
  tool posts a server action that invokes `runTool` through the session's tenant handle (resolves
  `business_id` server-side, never trusts the client). Phone-first; results appear back in the
  existing context/conversation view.

## Risks / Trade-offs

- [A tool gains a write path] → `run(ctx)` receives no DB handle and returns only proposed values;
  the runner alone persists, and only as `pending` suggestions + a conversation post. A boundary
  test asserts the tool `ctx` exposes no mutators and the runner never calls an accept path.
- [A tool mints a non-pending suggestion] → tools return *proposed* shapes; the runner sets status
  `pending`. Status is not in the tool's output type.
- [AI SDK leaks into pure modules] → only `src/ai/`'s real impl imports `@anthropic-ai/sdk`;
  `src/tools/` and the contract depend on the `ModelPort` interface, and unit tests inject the
  mock. `src/engine/` and `src/context/` stay import-free of both.
- [Live key required to build/test] → the platform's acceptance runs entirely on the mock port;
  the Anthropic impl is constructed only when `ANTHROPIC_API_KEY` is set. Live proof is a deferred
  task (relevant_notes.md §5).
- [Tenant leakage on `tool_run`] → the row is written through the tenant-bound handle with
  `business_id` stamped from the handle; the isolation test covers cross-tenant read/write.
- [Cost of a failed run is invisible] → the runner records a `tool_run` with `status = error` and
  whatever usage/latency accrued, so partial spend is still observable.

## Migration Plan

One forward-only Drizzle migration (`0004`) adding `tool_runs`: `business_id` + `project_id`
non-null, the token/latency/status columns, RLS enabled with a per-business policy on
`public.current_business_id()` and `GRANT … TO authenticated` in the same file (mirror 0000–0003).
Additive; no backfill.

## Open Questions

- **Usage fields when a tool makes several model calls** — v1 sums tokens across the run into one
  `tool_run`; per-call breakdown can arrive later if a tool needs it.
- **Reference tool visibility in production** — it ships as a dev/reference tool proving the
  platform; whether it stays surfaced once real tools exist is a later call (it can be hidden
  behind a flag without touching the contract).
- **`@anthropic-ai/sdk` install** — added as a dependency now but exercised only behind the key;
  if install is deferred, the real port is import-guarded so the mock path builds without it.
