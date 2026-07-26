## 1. Constitution amendment (its own commit)

- [x] 1.1 Amend `constitution.md` §3 to record the **per-line pricing direction** (each line may
  carry its own price; the total is the sum of line prices; unpriced lines take the
  proportional-to-cost allocation) and the **per-line profit-per-hour view** (labor-only; same
  thresholds; per-line nets reconcile to the estimate net). Commit alone, stating what changed and why.

## 2. Engine — allocation + per-line math (before any consumer)

- [x] 2.1 Extract the proportional-cost allocation into the pure engine (`allocatePriceToLines`:
  exact to the cent, remainder → largest-cost line, ties by line order — byte-identical to
  `client-projection`'s current behavior); unit-test it, including the zero-direct-cost
  not-applicable guard.
- [x] 2.2 Point `src/estimate/client-projection.ts` at the engine allocation; keep its existing tests
  green (no behavior change).
- [x] 2.3 Roll-up uses the **effective** line price (entered `priceCents` else derived baseline);
  `revenue = Σ` effective price; entered line prices supersede a total override; regression test
  that whole-estimate figures are unchanged for legacy inputs, plus tests for partial pricing
  (one entered price moves only its own line + the total) and precedence over the override.
- [x] 2.4 Per-line net decomposition (`effectivePrice − directCost − overheadAllocated −
  contingencyShare`, contingency allocated on the `cost+overhead` base) + the **reconciliation
  invariant** test (`Σ lineNet == netProfit` exactly, to the cent) + zero-base contingency guard.
- [x] 2.5 Per-line labor profit-per-hour + signal on the config thresholds; non-labor → no signal;
  zero-hour labor → not-applicable. Boundary tests at ratio 0.79 / 0.80 / 0.99 / 1.00.
- [x] 2.6 Extend the estimate computation to return the per-line array (each line's price, cost,
  overhead, hours, net, profit-per-hour, signal) alongside the unchanged roll-up; export from
  `src/engine/index.ts`.

## 3. Estimate module plumbing

- [x] 3.1 Thread the optional per-line price (`priceCents`) through `StoredLineItem` → engine line;
  `computeEstimate` surfaces the per-line results. **Only user-entered prices are ever written**;
  add a test asserting a margin-solve persists no `priceCents`.
- [x] 3.2 Tests: an entered line price sums into the total with margin as an outcome; a legacy
  estimate with no entered prices is identical to before per-line pricing; a cost change after a
  solve still re-solves (nothing was frozen).

## 4. Verification & isolation guard

- [x] 4.1 `npm run typecheck`, `npx vitest run` (engine + estimate + client-projection green),
  `npm run build`.
- [x] 4.2 **Isolation guard:** confirm this change touches no schema/migration, no `src/db/`, no RLS,
  and no `src/tools/` — `priceCents` is read from the existing column, so there is no new tenant
  surface to isolate; confirm legacy-estimate whole-estimate + portfolio outputs are byte-identical.
- [x] 4.3 Update `PROGRESS.md` R2 (per-line change) status; note **no** new deferred live-infra items
  (no schema/migration).
