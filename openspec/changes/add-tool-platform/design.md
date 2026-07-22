# Design — the tool platform (contract, runner, AI port, cost logging)

## Context

Change #5 built the substrate every tool binds to: the read-only `ProjectSnapshot`, the one
conversation, and the suggestions queue with a server-side accept-only mutation path. What is
missing is the thing that *runs*: a uniform shape for what a tool **is**, the one code path
that **invokes** one safely, the **AI port** a tool calls, and the **`tool_run`** audit of
what a run cost. This change lays exactly that down — no real user-facing tool — and shapes it
deliberately so the four tools (#7–#10) and the composable graph editor (#12) extend it rather
than rework it.

The constitution's core safety rule (§5: a tool receives a read-only snapshot and can only
emit suggestions) becomes **structural in the type system** here. It also has to survive
composition: §5 "Composing tools" requires the accept-to-commit guarantee to hold across a
whole graph, not just one tool. The design below keeps a powerful, typed tool-to-tool data
path while making an un-accepted estimate/context change unreachable through it.

## Goals / Non-Goals

**Goals**
- One `Tool` contract — `inputSchema` / `outputSchema` (Zod) + `run(ctx)` — returning a
  three-part `ToolResult` (`output` / `suggestions` / `message`), typed and side-effect-free.
- A first-class tool **registry** the UI, auto-triggers (#9), and the graph editor (#12) read.
- One tool **runner**: validate input → snapshot → `run(ctx)` → validate output + suggestions
  → **dedupe** → create `pending` suggestions → post one conversation message → record a
  `tool_run` **linked** to what it produced. The only commit path is suggestions→accept.
- `src/ai/` — a **mockable model port** whose request/response shape already fits web search
  (#7) and vision (#8): system + messages + optional images + optional server-tool
  declarations in; content + usage + optional citations out. Mock in tests; Anthropic behind
  `ANTHROPIC_API_KEY`; config centralized.
- A **fenced** typed-output side-channel so #12 can route `output → input` without ever
  bypassing accept-to-commit.
- `tool_run` cost logging + a nullable `tool_run_id` link on suggestions/messages; tenant-
  isolated; a reference tool proving the path against the mock.

**Non-Goals**
- No real tool; no web search / vision / upload / auto-trigger *executed*; no graph editor
  UI; no `document` suggestion target; no live model calls in this change's acceptance
  (key-gated, deferred); no new financial math.

## Decisions

### The `Tool` contract — three separated outputs
A tool is a plain typed object, not a class:
`{ name, title, inputSchema, outputSchema, run(ctx) }`. `run` is pure with respect to
persistence — it receives `ctx = { snapshot: ProjectSnapshot, input, ai: ModelPort }` (a
read-only snapshot; no DB handle) and returns a validated `ToolResult`:

- **`output`** — validated against `outputSchema`; the tool's machine-readable result
  (materials, findings, a search summary). Read-only data. This is what `inputSchema` /
  `outputSchema` *describe*, which is why they stay introspectable for the graph editor.
- **`suggestions`** — `ProposedSuggestion[]`, reusing change #5's `proposedContextEntrySchema`
  / `proposedLineItemSchema` shapes (the `document` target is added by #10, not here). Status
  is **not** in the tool's output — the runner sets `pending`, so a tool cannot mint an
  `accepted` one.
- **`message`** — optional `{ body, disclaimer? }` for the single conversation.

Separating `output` (routable data) from `suggestions` (the commit channel) is the crux of
the "typed side-channel with security checks" answer: composition routes `output`; commits
still only travel as suggestions the user accepts.

*Alternative rejected:* fold everything into one `suggestions` return (Option-1 shared-memory
bus only). Cleaner, but it forces every graph edge through the human queue even when a tool
just wants to hand structured data downstream — the user asked for the typed side-channel, so
we keep `output` distinct and fence it instead.

### The tool registry
`src/tools/registry.ts` exports a `Map<string, Tool>` (or a typed record) of the available
tools. The Tools surface enumerates it; #9's auto-trigger resolves a tool by name from it;
#12's graph editor lists nodes from it. Registering the reference tool here proves the seam.

### The runner — the one impure path
`runTool(toolName, { projectId, input, source })` under a tenant-scoped handle:
1. resolve the tool from the registry; `tool.inputSchema.parse(input)`;
2. build the snapshot from the tenant DB (entries + conversation + active-estimate roll-up via
   the engine — reuse `buildProjectSnapshot`);
3. `tool.run(ctx)`; `tool.outputSchema.parse(result.output)`; validate each proposed
   suggestion;
4. **dedupe**: for each proposed suggestion, skip it if an identical one (same `target` +
   canonical `payload` + `targetEstimateId`) is already `pending` for the project;
5. create the survivors as `pending` suggestions (`createSuggestion`), post the message
   (`postMessage`, carrying any `disclaimer`), and record one `tool_run`;
6. stamp `tool_run_id` on the created suggestions and message.

Steps 4–6 run through the tenant-bound handle, so a tool's output is committed only as pending
suggestions — never a direct estimate/context write. `source` (`"user"` | `"auto"` |
`"compose"`) is recorded for provenance and is the hook #9/#12 use without changing the
contract.

### Dedup (the gap #5 handed the platform)
Change #5 deferred "de-duping *new* identical suggestions" to the platform. The runner
compares each proposal against the project's current `pending` set by
`(target, targetEstimateId, canonicalJSON(payload))` and drops exact matches. `dismissed`
suggestions are already excluded from `pending` (change #5), so a dismissed proposal that
reappears is *not* re-created either. Canonical JSON = stable key order, so field ordering
doesn't defeat the match.

### `src/ai/` — a port shaped for the real tools
- `src/ai/config.ts` — centralized model IDs (`claude-opus-4-8` default), effort/thinking
  defaults, and settings. One place, no scattered constants (constitution §6 / techstack §6).
- `ModelPort.complete(request)` where `request = { system?, messages, images?, serverTools?,
  model?, effort? }` and the result is `{ content, text, usage: { inputTokens, outputTokens },
  citations? }`. `images` (vision, #8) and `serverTools` (web search, #7) are part of the
  interface now but the **mock ignores them** — #7–#9 add *behavior*, not new interface.
- `createMockModelPort()` — deterministic, used by all unit tests (no network).
- `resolveModelPort()` — returns `createAnthropicModelPort()` (wraps `@anthropic-ai/sdk`,
  server-only, import-guarded) when `ANTHROPIC_API_KEY` is set, else reports `unconfigured`
  and never constructs the real client (mirrors `getServerSession()`).
The reference tool uses the mock, so the platform's acceptance needs no key.

### `tool_run` + traceability
`tool_runs` is a business-owned table via the `TenantDb` seam: `business_id` (non-null),
`project_id`, `tool_name`, `status` (`ok | error`), `input_tokens`, `output_tokens`,
`latency_ms`, `source`, `created_at`. New `ToolRunsBackend` port (memory impl in `tenant.ts`
for the isolation test; Drizzle impl in `drizzle-backend.ts` inside `withAuthenticatedTx`),
wired in `session.ts`. `business_id` is stamped from the bound handle, never input. Migration
`0004` also **adds a nullable `tool_run_id`** to `suggestions` and `conversation_messages`
(FK → `tool_runs`), so each emission is traceable to the run — and its cost — that produced
it. Additive and backward-compatible; existing rows keep `null`.

### The reference/echo tool
`reference` takes `{ note: string }`, reads the snapshot (e.g. counts entries), asks the
**mock** port for a one-line summary, and returns `output = { echo, entryCount }` + one
proposed `fact` suggestion + a conversation post. One end-to-end run yields: input validated →
snapshot in → typed output validated → a `pending` `fact` suggestion (deduped) → one
tool-authored message → one `tool_run` logged, with `tool_run_id` on both emissions.

### The Tools surface
`app/(app)/projects/[id]/tools/` lists the registry and opens a tool; running the reference
tool posts a server action that calls `runTool` through the session's tenant handle (resolves
`business_id` server-side, never trusts the client). Phone-first; results appear in the
existing context/conversation view.

## Risks / Trade-offs

- [The side-channel becomes a write path] → `run(ctx)` gets no DB handle; the runner alone
  persists, and only as `pending` suggestions + a message. `output` is validated read-only
  data with no commit capability. A boundary test asserts the tool `ctx` exposes no mutator
  and that composing outputs cannot create a non-pending suggestion.
- [A tool mints a non-pending suggestion] → tools return *proposed* shapes; the runner sets
  `pending`. Status isn't in the output type.
- [Dedup false-negatives spam the queue] → canonical-JSON payload key defeats field-order
  drift; `pending`-only comparison means dismissed proposals never resurface.
- [AI SDK leaks into pure modules] → only `src/ai/`'s real impl imports `@anthropic-ai/sdk`;
  `src/tools/` depends on the `ModelPort` interface, and tests inject the mock. `src/engine/`
  and `src/context/` import neither.
- [Live key required to build/test] → acceptance runs entirely on the mock; the Anthropic impl
  is constructed only when the key is set. Live proof is deferred (relevant_notes §5).
- [Tenant leakage on `tool_run` or a composed hop] → every write goes through the tenant-bound
  handle with `business_id` stamped from the handle; the isolation test covers cross-tenant
  read/write; a composed run stays same-tenant/same-project by construction.
- [Runaway auto-trigger / compose loop] → the runner carries a step budget on `source: "auto"`
  / `"compose"` runs; #9/#12 uphold it. v1 records `source` and enforces a simple depth cap.
- [Failed run hides cost] → the runner records a `tool_run` with `status = error` and whatever
  usage/latency accrued.

## Migration Plan

One forward-only Drizzle migration (`0004`): create `tool_runs` (`business_id` + `project_id`
non-null, token/latency/status/source columns) with RLS enabled, a per-business policy on
`public.current_business_id()`, and `GRANT … TO authenticated` in the same file (mirror
0000–0003); and `ALTER TABLE` add nullable `tool_run_id` (FK → `tool_runs`, `ON DELETE SET
NULL`) to `suggestions` and `conversation_messages`. Additive; no backfill.

## Open Questions

- **Usage across multiple model calls** — v1 sums tokens across a run into one `tool_run`;
  per-call breakdown can arrive later if a tool needs it.
- **Reference tool in production** — ships as a dev/reference tool; whether it stays surfaced
  once real tools exist is a later call (hide behind a flag without touching the contract).
- **`document` target + `output` routing schema** — the `document` suggestion target (#10) and
  the concrete graph wiring/output-routing rules (#12) are named here as extension points but
  designed later; v1 only guarantees the shapes stay typed and fenced.
