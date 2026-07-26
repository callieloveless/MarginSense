## 1. Engine — portfolio aggregate (before UI)

- [x] 1.1 Add `aggregateProfitPerHour(jobs)` to the engine returning `{ aggregate, shortfall, signal,
  inputs }` (`Σ netProfit / Σ laborHours`, shortfall clamped at 0, same absolute thresholds,
  `Computed` not-applicable on zero hours); unit tests including the boundaries (0.79/0.80/0.99/1.00),
  the shortfall clamp, and the NA case.
- [x] 1.2 Export it from `src/engine/index.ts` and surface it through `src/profit` for the dashboard.

## 2. Dashboard

- [x] 2.1 Lead the dashboard with the pulse card (aggregate profit/hr, plain verdict scoped honestly
  to "across your active jobs", shortfall, progress toward target — clamped at zero, drill-down to
  Σ net / Σ hours / target / shortfall) on the R1 primitives.
- [x] 2.2 Reshape the ranked cards so each shows the job's own profit/hr + a signal chip + its note;
  keep the worst-first ordering and the "% of your year / % of your profit goal" figures.
- [x] 2.3 Calm empty/NA states: no priced active jobs → the pulse's not-applicable state; draft jobs
  excluded from the aggregate denominator but shown as calm cards; negative aggregate renders red
  with the negative figure stated plainly.
- [x] 2.4 Dashboard header per the prototype (business identity, settings entry) + the camera
  quick-capture: a job-picker bottom sheet (R1 primitive) landing on the chosen job's photo
  surface; with no jobs the sheet teaches and offers "new job" (no dead control).

## 3. Verification & isolation guard

- [x] 3.1 `npm run typecheck`, `npx vitest run` (engine + dashboard), `npm run build`; phone-width
  dashboard pass.
- [x] 3.2 **Isolation guard:** no schema/migration, `src/db/`, RLS, or `src/tools/` change; the
  aggregate reads the existing tenant-scoped active-estimate set — no new tenant surface.
- [x] 3.3 Update `PROGRESS.md` R2 (portfolio-pulse) status; no new deferred live-infra items.
