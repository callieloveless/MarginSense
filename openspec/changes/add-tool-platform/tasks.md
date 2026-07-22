# Tasks — add-tool-platform

## 1. Persistence — `tool_runs` (tenant-scoped)

- [ ] 1.1 Add `tool_runs` (project_id, tool_name, status enum `ok|error`, input_tokens,
      output_tokens, latency_ms, created_at, non-null `business_id`) via Drizzle; add row types
- [ ] 1.2 `npm run db:generate` → migration `0004`; hand-append RLS (enable + per-business policy
      on `public.current_business_id()` + `GRANT … TO authenticated`) in the same file
- [ ] 1.3 `ToolRunsBackend` port — memory impl in `src/db/tenant.ts`, Drizzle impl in
      `src/db/drizzle-backend.ts` (inside `withAuthenticatedTx`), wired in `src/db/session.ts`;
      `TenantDb.recordToolRun(...)` / `listToolRuns(...)` stamp `business_id` from the handle
- [ ] 1.4 Tenant-isolation test: cross-tenant read of `tool_runs` blocked; `business_id` stamped
      from the handle, never input

## 2. AI model port (`src/ai/`)

- [ ] 2.1 `src/ai/config.ts` — centralized model IDs (default `claude-opus-4-8`) + AI settings;
      no magic constants elsewhere
- [ ] 2.2 `ModelPort` interface — `complete(request)` returns text + `usage` (tokens) + latency
- [ ] 2.3 `createMockModelPort()` — deterministic, used by all unit tests (no network)
- [ ] 2.4 `createAnthropicModelPort()` — wraps `@anthropic-ai/sdk`, server-only, behind
      `ANTHROPIC_API_KEY`; a resolver that reports `unconfigured` and does not construct the real
      client when the key is absent (mirror `getServerSession()`)
- [ ] 2.5 Unit tests: mock port shape; unconfigured resolver returns `unconfigured` with no key

## 3. Tool contract + runner (`src/tools/`)

- [ ] 3.1 `Tool` contract type — `{ name, title, inputSchema, outputSchema, run(ctx) }`;
      `ToolContext = { snapshot, input, ai }` (read-only snapshot; no DB handle); `ToolResult`
      reuses change #5's proposed context-entry / line-item shapes + a conversation body
- [ ] 3.2 `runTool(tool, { projectId, input })` on the `TenantDb` seam: validate input → build
      snapshot (`buildProjectSnapshot`, active roll-up via engine) → `run(ctx)` → validate output
      → create each proposal as a `pending` suggestion (`createSuggestion`) → post one
      `tool`-authored message (`postMessage`) → record one `tool_run`
- [ ] 3.3 On `run`/validation failure: record a `tool_run` with status `error`; no suggestion or
      post; surface the error
- [ ] 3.4 The reference/echo tool — `{ note }` in; reads the snapshot; asks the **mock** port for
      a one-line summary; returns one proposed `fact` suggestion + a conversation body
- [ ] 3.5 Unit tests: contract validates I/O; runner emits exactly one pending suggestion + one
      post + one `tool_run`; boundary test that `ctx` exposes no mutator and the runner never
      calls an accept path; failure path logs `error` and commits nothing

## 4. UI (phone-first)

- [ ] 4.1 Tools surface under `app/(app)/projects/[id]/tools/`: list available tools, open one;
      link to it from the project page
- [ ] 4.2 Run the reference tool via a server action that calls `runTool` through the session's
      tenant handle (business resolved server-side; never trust a client `business_id`); on
      success revalidate the context view so the suggestion + post appear
- [ ] 4.3 Phone-first; plain language; any number via the engine (`formatCents`); no color-only
      cues; an "connect AI" state where a live model would be required

## 5. Verification

- [ ] 5.1 `npm run typecheck`, full Vitest suite, and `npm run build` green
- [ ] 5.2 `src/engine/` and `src/context/` stay framework/DB/SDK-free; only `src/ai/`'s real impl
      imports `@anthropic-ai/sdk`; `src/tools/` depends on the `ModelPort` interface + the mock in
      tests; `src/` relative imports stay extensionless
- [ ] 5.3 The tool `ctx` exposes no write path and the runner's only outputs are pending
      suggestions + a conversation post + a `tool_run` (asserted in tests)
- [ ] 5.4 `openspec validate add-tool-platform --strict` passes

## Deferred to live infra (owner provisions Supabase + `ANTHROPIC_API_KEY`)

- [ ] Apply migration `0004` to the live database (`npm run db:migrate`)
- [ ] Prove `tool_runs` RLS via `npm run test:rls`
- [ ] Set `ANTHROPIC_API_KEY`; prove one real model call end-to-end through the reference tool and
      confirm `tool_run` records live token/latency usage (relevant_notes.md §5)
