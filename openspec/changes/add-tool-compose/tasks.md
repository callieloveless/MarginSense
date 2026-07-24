## 1. The compose seam and its registry

- [ ] 1.1 Add `app/_lib/compose.ts`: the `ComposeEdge` type (`{ consumer: string; map(output,
      ctx): Promise<unknown[]> }`), the `ComposeContext` type (`{ tenantDb, projectId, step }`),
      and `COMPOSE_EDGES: Record<string, ComposeEdge[]>` initialized **empty** (the dormant seam,
      same shape as `TRIGGERS`) with a comment that 9b registers the first edge.
- [ ] 1.2 Implement `composeAfterRun(producerName, output, ctx, deps)`: look up the producer's
      edges, `await edge.map(output, ctx)` for each, and `dispatch` every mapped input with
      `source: "compose"` and `step: ctx.step + 1`. Return a small summary
      (`{ started, failed }`). A no-op (returns zeros) when no edge is registered.
- [ ] 1.3 Make it failure-isolating: a throwing consumer, an unknown consumer name, or a mapper
      that throws is caught, logged with `console.error`, counted in `failed`, and never
      re-thrown — composition must not fail the producer run that already succeeded.
- [ ] 1.4 Do not raise `MAX_TOOL_STEPS` or change `dispatch`/the runner; the step budget is fed
      the right step, not widened.

## 2. Wire it after the one producer that can fan out today

- [ ] 2.1 Call `composeAfterRun("photo-advisor", outcome.output, { tenantDb, projectId, step: 0 },
      deps)` in `app/_lib/photo-advise.ts` after Photo Advisor's dispatch succeeds, using the same
      `dispatchDeps` the run used. With `COMPOSE_EDGES` empty this is a no-op.
- [ ] 2.2 Fold any composed-run count into the action's result message only when non-zero, so
      today's message is unchanged (no edge → nothing to say).

## 3. Prove the seam with a reference producer/consumer

- [ ] 3.1 Unit-test `app/_lib/compose.test.ts` against the memory backends, registering a
      throwaway edge for the test (restored afterward, like the `photo.uploaded` tests):
      a producer output that maps to N consumer inputs starts N `compose` runs, each recorded as
      a `tool_run` with source `compose`.
- [ ] 3.2 Assert the step increment: a producer dispatched at step 0 yields composed runs at step
      1, and a composed run dispatched at `MAX_TOOL_STEPS - 1` is refused by the budget.
- [ ] 3.3 Assert composed output stays `pending`: a consumer that proposes a suggestion leaves it
      `pending`, nothing committed.
- [ ] 3.4 Assert failure isolation: a mapper that throws and a consumer that throws are both
      counted in `failed`, logged, and do not throw out of `composeAfterRun`.
- [ ] 3.5 Assert the dormant default: with `COMPOSE_EDGES` empty, `composeAfterRun` starts no run
      and `advisePhoto`'s result is byte-for-byte what it was before this change.

## 4. Verification and close-out

- [ ] 4.1 `npm run typecheck`, `npx vitest run`, and `npm run build` green (relative imports in
      `src/` stay extensionless).
- [ ] 4.2 Update `PROGRESS.md`: split #9 into 9a (this change — compose seam) and 9b (Code
      Finder), with 9a's status.
- [ ] 4.3 `openspec validate add-tool-compose --strict`, then archive on its own commit.
