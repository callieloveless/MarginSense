## 1. Engine — derived display figures (before UI)

- [x] 1.1 Add `monthlyOverheadCents` (`roundHalfUp(annual_overhead / 12)`) and
  `targetBillRatePerHour` (`loadedCostPerHour + targetProfitPerHour`, `Computed`, not-applicable when
  either is) to `BusinessRates` / `deriveRates` in `src/engine/rates.ts`.
- [x] 1.2 Rates tests: the reference figures ($5,000.00 monthly overhead, $181.25/hr bill rate) and
  the not-applicable case when there is no billable capacity.

## 2. Derived-rates playback — expand + tokenize (shared by Review + Settings)

- [x] 2.1 Regroup `DerivedRates` into *Your capacity · What an hour costs you · Your targets* on the
  shell tokens (`Card` + drillable rows), keeping the `<details>` inputs drill-down.
- [x] 2.2 Add rows for annual billable hours, monthly overhead, and the target bill rate; keep the
  six existing rates; each drillable to its inputs; emphasize target profit/hr + the bill rate.

## 3. Onboarding — guided flow

- [x] 3.1 Add a welcome gate to the wizard: the value headline + *Get started* + *Skip for now*
  (routes to the dashboard).
- [x] 3.2 Add a first "Your business" step (name/trade read-only confirm + a `serviceArea` input with
  the jurisdiction hint), prefilled; keep the three profit steps; use `SteppedProgress`; restyle to
  shell tokens with friendlier copy.
- [x] 3.3 Restyle the onboarding page + Review to the shell; Review renders the expanded
  `DerivedRates`; keep "store inputs only, never derived".

## 4. Settings — restyle

- [x] 4.1 Restyle the Settings page + form to the shell tokens (same inputs + advanced defaults +
  service area) and add a *Replay setup* entry.

## 5. Verify & isolation guard

- [x] 5.1 `npm run typecheck`, `npx vitest run`, `npm run build`; phone-width walk of onboarding
  (welcome → steps → review) and Settings.
- [x] 5.2 **Isolation guard:** no schema/migration, `src/db/`, RLS, or `src/tools/` change; service
  area uses the existing column; no new tenant surface.
- [x] 5.3 Update `PROGRESS.md` R3 status (note the onboarding+settings consolidation).
