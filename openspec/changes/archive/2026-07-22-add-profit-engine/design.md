# Design — profit engine

## Context

The profit engine is the foundational capability: the dashboard, estimate screens, and
every tool render numbers this module produces, and it is the typed vocabulary through
which the estimate, profitability, and tool modules stay connected without merging
(constitution §6.8). The constitution makes it load-bearing — §3 fixes the financial math
(now the solo-operator, annual-basis model) and §6.1 requires a pure, deterministic,
unit-tested module with no I/O or framework imports. This is greenfield (`src/engine/` is
empty), so the design work is about picking representations that keep the math exact and
traceable.

## Goals / Non-Goals

**Goals**
- One pure module that owns all money math; UI/DB never re-derive totals.
- Exact integer arithmetic for money (cents) and time (minutes); no float drift.
- Deterministic, fully unit-testable functions with results that carry their inputs.
- One config home for thresholds, the target-profit-per-hour formula, the contingency base,
  and rounding.

**Non-Goals**
- No persistence, network, AI, or React/Next/Drizzle imports.
- No locale/currency formatting beyond a cents→display helper.
- No estimate *editing* or storage, and no dashboard/portfolio *rendering* — those are the
  `src/estimate/` and `src/profit/` modules (separate changes). The engine transforms plain
  data only.
- No multi-role/crew math — single owner-operator for v1.

## Decisions

- **Money as `number` of integer cents, not a bigint or decimal library.** Cents fit
  comfortably in a JS safe integer for realistic contractor jobs, keeping the engine
  dependency-free. *Alternative:* a decimal library (dinero.js, big.js) — rejected as
  unnecessary weight; we guard with integer-only helpers and lint against float money.
- **Divide-by-zero returns a `null`/not-applicable result, never throws or `NaN`.** EPH,
  margins, the overhead rate, and target profit/hr all divide; zero-hour, zero-revenue, and
  zero-capacity inputs are normal, so the type models "not applicable" explicitly.
  *Alternative:* throwing — rejected because these are valid states the UI must render
  calmly.
- **Rates are derived on an annual basis** (constitution §3.3): `annualBillableHours =
  working_days_per_year × billable_minutes_per_day / 60`; `overheadRecoveryRate =
  annual_overhead / annualBillableHours`; monthly is a `/12` display derivation, never a
  separate source of truth. Loaded cost and break-even day rate are display/break-even
  concepts; the roll-up keeps labor and overhead as separate slices.
- **Target profit per hour = `(income_goal + profit_target) / annualBillableHours`.** This
  is the "every crew hour must return this much toward pay + profit" number that pairs with
  loaded cost. The formula choice lives in `config.ts` so it is not a scattered constant.
- **Contingency is a cost line with base `directCost + overheadAllocated`.** It reduces
  `netProfit` (`revenue − directCost − overheadAllocated − contingency`). The base is
  centralized in `config.ts`.
- **Pricing is margin-solve by default, price-entry on override.** Given costs and
  `target_margin_bp`, the engine solves total price so `netMargin` hits target, rounds the
  solved price to whole cents, and lets margin absorb the sub-cent remainder. Any user
  override switches the affected line/total to entered-price and recomputes `netMargin` as
  an outcome. The engine exposes both directions through one API so the caller (the
  estimate module) chooses per line/estimate.
- **Signal returns a struct `{ color, ...inputs }`, not just an enum.** §6.6 requires every
  color to be explainable, so the inputs (EPH, target, ratio; or hour share, profit share,
  weight; or `percentOfYear`, `percentOfProfitGoal`) travel with the verdict.
- **Portfolio contribution is measured before overhead allocation.** `percentOfProfitGoal =
  (netProfit + overheadAllocated) / grossProfitGoal` (equivalently `(revenue − directCost −
  contingency) / grossProfitGoal`), because the gross-profit goal is exactly what overhead
  is meant to fund. Reconciles the mockup's 10.05%.
- **Thresholds are parameters with documented defaults** (green ≥1.00, yellow 0.80–0.99,
  red <0.80), sourced from business settings via `config.ts`. The *method* is fixed; the
  *numbers* are per business (constitution §3.5).
- **Rounding is centralized** in one half-up helper used only at the display boundary; core
  arithmetic stays in exact integers.

## Risks / Trade-offs

- [Float creeps into money math] → integer-only helpers in `money.ts`; unit tests assert
  exact cents; no `parseFloat`/decimal dollars anywhere in `src/engine/`.
- [Margin-solve rounding disputes] → solve to whole cents once, let margin absorb the
  remainder, and test that the recomputed `netMargin` is within one cent of target.
- [Rounding disputes on shared totals] → single documented rounding function with boundary
  tests; round once, at display.
- [Threshold boundary off-by-one] → explicit tests at 0.79 / 0.80 / 0.99 / 1.00.
- [Estimate/profit concerns bleed together] → the engine is math-only and stateless; the
  estimate/profit split is enforced in the consuming modules (§6.8), not here.

## Migration Plan

Additive only — a new module with no consumers yet, no schema and no data. No rollback
concerns; deleting the module reverts the change.

## Open Questions

_Resolved from `open-questions.md` (defaults accepted): annual-basis rates (C1),
target-profit-per-hour = `(income + profit)/hours` (C6-i), contingency base =
`directCost + overheadAllocated` (D2), margin-solve pricing (D4), the `config.ts` split
(G3), and the `percentOfProfitGoal` denominator = gross-profit goal (X1)._

- Confirm the exact display convention for a not-applicable EPH/margin (e.g. "—" vs "n/a")
  with the UI layer when it is built.
- Compare shares in rationals internally to avoid share-rounding artifacts, rounding only
  at display (leaning yes).
