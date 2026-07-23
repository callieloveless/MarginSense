# Tasks — add-tool-platform

## 1. Persistence — `tool_runs` + traceability (tenant-scoped)

- [x] 1.1 Add `tool_runs` (project_id, tool_name, status enum `ok|error`, input_tokens,
      output_tokens, latency_ms, source enum `user|auto|compose`, created_at, non-null
      `business_id`) via Drizzle; add row types
- [x] 1.2 Add nullable `tool_run_id` (FK → `tool_runs`, `ON DELETE SET NULL`) to `suggestions`
      and `conversation_messages` in the schema
- [x] 1.3 `npm run db:generate` → migration `0004`; hand-append RLS for `tool_runs` (enable +
      per-business policy on `public.current_business_id()` + `GRANT … TO authenticated`) in
      the same file; confirm the two `ALTER TABLE … ADD COLUMN` statements are present
- [x] 1.4 `ToolRunsBackend` port — memory impl in `src/db/tenant.ts`, Drizzle impl in
      `src/db/drizzle-backend.ts` (inside `withAuthenticatedTx`), wired in `src/db/session.ts`;
      `TenantDb.recordToolRun(...)` / `listToolRuns(...)` stamp `business_id` from the handle;
      extend `createSuggestion` / `postMessage` to accept an optional `toolRunId`
- [x] 1.5 Tenant-isolation test: cross-tenant read of `tool_runs` blocked; `business_id`
      stamped from the handle, never input

## 2. AI model port (`src/ai/`)

- [x] 2.1 `src/ai/config.ts` — centralized model IDs (default `claude-opus-4-8`),
      effort/thinking defaults + AI settings; no magic constants elsewhere
- [x] 2.2 `ModelPort` interface — `complete({ system?, messages, images?, serverTools?, model?,
      effort? })` → `{ content, text, usage: { inputTokens, outputTokens }, citations? }`
      (images + serverTools declared now; mock ignores them)
- [x] 2.3 `createMockModelPort()` — deterministic, used by all unit tests (no network)
- [x] 2.4 `createAnthropicModelPort()` — wraps `@anthropic-ai/sdk`, server-only, import-guarded;
      `resolveModelPort()` reports `unconfigured` and does not construct the real client when
      `ANTHROPIC_API_KEY` is absent (mirror `getServerSession()`)
- [x] 2.5 Unit tests: mock port shape; unconfigured resolver returns `unconfigured` with no key

## 3. Tool contract + registry + runner (`src/tools/`)

- [x] 3.1 `Tool` contract — `{ name, title, inputSchema, outputSchema, run(ctx) }`;
      `ToolContext = { snapshot, input, ai }` (read-only snapshot; no DB handle);
      `ToolResult = { output, suggestions: ProposedSuggestion[], message?: { body, disclaimer? } }`
      reusing change #5's proposed context-entry / line-item shapes
- [x] 3.2 Tool registry (`src/tools/registry.ts`) — `name → Tool`; resolve-by-name; the surface
      and future auto-trigger/graph editor read it
- [x] 3.3 `runTool(toolName, { projectId, input, source })` on the `TenantDb` seam: resolve from
      registry → validate input → build snapshot (`buildProjectSnapshot`, active roll-up via
      engine) → `run(ctx)` → validate `output` + each suggestion → **dedupe** against the
      project's `pending` set by `(target, targetEstimateId, canonicalJSON(payload))` → create
      survivors as `pending` (`createSuggestion`) → post one `tool`-authored message
      (`postMessage`, with any `disclaimer`) → record one `tool_run` → stamp `tool_run_id` on
      the created suggestions and message
- [x] 3.4 On `run`/validation failure: record a `tool_run` with status `error`; no suggestion
      or post; surface the error. Enforce a step-budget cap on `source: "auto" | "compose"` runs
- [x] 3.5 The reference/echo tool — `{ note }` in; reads the snapshot; asks the **mock** port
      for a one-line summary; returns `output = { echo, entryCount }` + one proposed `fact`
      suggestion + a conversation body; registered in the registry
- [x] 3.6 Unit tests: contract validates input + `output`; runner emits deduped pending
      suggestion(s) + one post + one linked `tool_run`; **boundary test** that `ctx` exposes no
      mutator, that routed `output` cannot create a non-pending suggestion, and that the runner
      never calls an accept path; failure path logs `error` and commits nothing; dedup drops an
      identical pending proposal

## 4. UI (phone-first)

- [x] 4.1 Tools surface under `app/(app)/projects/[id]/tools/`: list the registry, open one;
      link to it from the project page
- [x] 4.2 Run the reference tool via a server action that calls `runTool` through the session's
      tenant handle (business resolved server-side; never trust a client `business_id`;
      `source: "user"`); on success revalidate the context view so the suggestion + post appear
- [x] 4.3 Phone-first; plain language; any number via the engine (`formatCents`); no color-only
      cues; a "connect AI" state where a live model would be required; render a tool's
      `disclaimer` when present

## 5. Verification

- [x] 5.1 `npm run typecheck`, full Vitest suite, and `npm run build` green
- [x] 5.2 `src/engine/` and `src/context/` stay framework/DB/SDK-free; only `src/ai/`'s real
      impl imports `@anthropic-ai/sdk`; `src/tools/` depends on the `ModelPort` interface + the
      mock in tests; `src/` relative imports stay extensionless
- [x] 5.3 The tool `ctx` exposes no write path; the runner's only outputs are deduped pending
      suggestions + a conversation post + a linked `tool_run`; a composed/routed `output` cannot
      bypass accept-to-commit (asserted in tests)
- [x] 5.4 `openspec validate add-tool-platform --strict` passes

## Deferred to live infra (owner provisions Supabase + `ANTHROPIC_API_KEY`)

- [ ] Apply migration `0004` to the live database (`npm run db:migrate`)
- [ ] Prove `tool_runs` RLS via `npm run test:rls`
- [ ] Set `ANTHROPIC_API_KEY`; prove one real model call end-to-end through the reference tool
      and confirm `tool_run` records live token/latency usage (relevant_notes.md §5)
