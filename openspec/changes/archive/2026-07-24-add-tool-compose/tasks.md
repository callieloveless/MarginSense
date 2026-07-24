## 1. The compose entry and its registry

- [x] 1.1 Add `app/_lib/compose.ts`: the `ComposeEdge` type (`{ consumer: string; map(output,
      ctx): Promise<unknown[]> }`), the `ComposeContext` type (`{ tenantDb, projectId, step }`),
      and `COMPOSE_EDGES: Record<string, ComposeEdge[]>` initialized **empty** (the dormant seam,
      same shape as `TRIGGERS`) with a comment that 9b registers the first edge.
- [x] 1.2 Implement `dispatchAndCompose(request, { tenantDb, port })`: build `dispatchDeps(tenantDb,
      port)`, call `dispatch(request, deps)`, and on success fan `outcome.output` out to
      `COMPOSE_EDGES[request.toolName]` — `await edge.map(output, ctx)` and `dispatch` each mapped
      input with `source: "compose"` and `step: (request.step ?? 0) + 1`. Return the producer's
      `ToolRunOutcome` unchanged. If the producer's own `dispatch` throws, let it propagate and
      compose nothing.
- [x] 1.3 Make the fan-out failure-isolating: a throwing consumer, an unknown consumer name, a
      mapper that throws, or a composed run the step budget refuses is caught, logged with
      `console.error`, and never re-thrown — composition must not fail the producer run that
      already succeeded.
- [x] 1.4 Do not raise `MAX_TOOL_STEPS` or change `dispatch`/the runner; the entry feeds the step
      budget the right step, not a wider one.

## 2. Route the app-layer tool actions through it (no behavior change)

- [x] 2.1 Replace the raw `dispatch(...)` in `app/_lib/photo-advise.ts` with
      `dispatchAndCompose(...)`, passing the resolved `tenantDb` and `port`. With `COMPOSE_EDGES`
      empty the result is identical.
- [x] 2.2 Do the same in Material Finder's search action and the reference tool's action, so every
      app-layer tool run shares one dispatch entry. Leave the manual-add path (no model, no
      dispatch) untouched.
- [x] 2.3 Confirm no result message or user-visible behavior changes today (no edge → nothing to
      compose); the existing tool-run tests stay green.

## 3. Prove the entry with a reference producer/consumer

- [x] 3.1 Unit-test `app/_lib/compose.test.ts` against the memory backends, registering a
      throwaway edge for the test (restored afterward, like the `photo.uploaded` tests): a producer
      output that maps to N consumer inputs starts N `compose` runs, each recorded as a `tool_run`
      with source `compose`, all through `dispatchAndCompose`.
- [x] 3.2 Assert the step boundary: a producer at step 0 yields composed runs at step 1; and a
      producer at `MAX_TOOL_STEPS - 1` fans out to a composed run at `MAX_TOOL_STEPS`, which the
      budget **refuses** (the run is not started, and the refusal is logged, not thrown).
- [x] 3.3 Assert composed output stays `pending`: a consumer that proposes a suggestion leaves it
      `pending`, nothing committed.
- [x] 3.4 Assert failure isolation: a mapper that throws and a consumer that throws are both logged
      and do not throw out of `dispatchAndCompose`, and the producer's outcome is still returned.
- [x] 3.5 Assert the dormant default: with `COMPOSE_EDGES` empty, `dispatchAndCompose` starts no
      composed run and returns exactly the producer's outcome — `advisePhoto` behaves as before.

## 4. Verification and close-out

- [x] 4.1 `npm run typecheck`, `npx vitest run`, and `npm run build` green (relative imports in
      `src/` stay extensionless).
- [x] 4.2 Update `PROGRESS.md`: split #9 into 9a (this change — compose seam) and 9b (Code
      Finder), with 9a's status.
- [x] 4.3 `openspec validate add-tool-compose --strict`, then archive on its own commit.
