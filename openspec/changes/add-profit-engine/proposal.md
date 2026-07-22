# Add the profit engine

## Why

MarginSense answers one question — *is this estimate pulling its weight?* — and every red/
yellow/green signal, EPH figure, and dashboard color depends on the same financial math.
That math must be computed in exactly one pure, tested place so it is correct and
traceable; nothing else can be built on top of it until it exists. The engine is also the
**shared vocabulary** through which the three separate concerns — estimate editing, profit
signaling, and the AI tools — talk to each other without merging (constitution §6.8).

## What Changes

- Introduce the **profit engine**: the pure, deterministic module in `src/engine/` that
  owns all financial math (constitution §3, §6.1). No framework, DB, or AI imports.
- Add money/time primitives: integer **cents**, integer **minutes**, **basis-point**
  percentages, with safe rounding at display only.
- Add **derived business rates** on an **annual** basis (constitution §3.3): annual
  billable hours, **overhead recovery rate**, **burdened labor rate**, **loaded cost per
  hour**, **break-even day rate**, **gross-profit goal**, and **target profit per billable
  hour**. Loaded cost is a break-even/display concept — the roll-up keeps labor and
  overhead as separate cost slices.
- Add the **estimate roll-up** (constitution §3.4): `revenue`, `directCost`, `laborHours`,
  `overheadAllocated`, **`contingency`** (`default_contingency_bp × (directCost +
  overheadAllocated)`, a real reserved cost), `netProfit` (now net of contingency),
  `grossMargin`, `netMargin`, and the crown-jewel **EPH = netProfit / laborHours**.
- Add **margin-driven pricing**: costs are entered and the engine **solves each line's
  `price` so the estimate hits `target_margin_bp`**; a user override flips a line/total to
  entered-price and `netMargin` becomes an outcome. Solved prices round to whole cents and
  margin absorbs the rounding.
- Add the **"pull-their-weight" signal** (constitution §3.5):
  - **Absolute view** — an estimate's color from `ratio = EPH / targetProfitPerHour`.
  - **Comparative view** — a job's fair share within the portfolio: `weight = profitShare /
    hourShare`, plus the concrete `percentOfYear = laborHours / annualBillableHours` and
    `percentOfProfitGoal = (netProfit + overheadAllocated) / grossProfitGoal`.
  - Both mapped to red / yellow / green with per-business thresholds.
- Add **`src/engine/config.ts`** as the single home for threshold defaults, the
  target-profit-per-hour formula, the contingency base, and rounding rules — no magic
  constants scattered around (constitution §6, techstack §6).
- Every result is **explainable**: the engine returns the inputs behind each color/figure
  so the UI can show the math (constitution §6.6).

## Capabilities

### New Capabilities
- `profit-engine` — money/time primitives, derived business rates, the estimate roll-up
  (with contingency and margin-solve), EPH, and the red/yellow/green signal (absolute and
  comparative/portfolio views).

### Modified Capabilities
- None (this is the foundational capability; `openspec/specs/` is currently empty).

## Impact

- **New code (all pure, in `src/engine/`):**
  - `money.ts` — cents/minutes/bp helpers, half-up display rounding, a not-applicable
    result type for safe division.
  - `rates.ts` — annual billable hours, overhead recovery rate, burdened labor rate, loaded
    cost, break-even day rate, gross-profit goal, target profit per hour.
  - `estimate.ts` — the roll-up and the margin-solve pricing.
  - `signal.ts` — absolute ratio, comparative weight, the portfolio `%`-figures, color +
    explain payload.
  - `config.ts` — threshold/formula/rounding config.
  - `index.ts` — the public engine API barrel; `*.test.ts` beside each module.
- **Dependencies:** Vitest for unit tests. No runtime dependencies (the engine is pure).
- **Module boundary (constitution §6.8):** the engine owns math only. Estimate *editing*
  (`src/estimate/`) and profit *signaling / dashboard* (`src/profit/`) are **separate**
  modules that consume this engine; they land as their own changes (`add-onboarding`,
  `add-estimate-dashboard`) and are explicitly out of scope here. Tools call the engine but
  never write.
- **Sequencing:** (1) constitution amendment (landed), (2) this engine, (3)
  `add-onboarding`, (4) `add-estimate-dashboard` (constitution §3, techstack §8).

## Non-goals

- No UI, database schema, persistence, or AI calls — those are separate changes that
  *consume* this engine.
- No currency/locale formatting beyond the cents→display helper; presentation lives in the
  UI layer, which also owns the plain-language wording (EPH stays an internal engine term).
- Threshold **values**, the target-profit-per-hour formula choice, and the contingency base
  are configurable/centralized in `config.ts`, sourced per business — only the *method* and
  the default numbers (≥1.00 / 0.80–0.99 / <0.80) are fixed here.
- No multi-role/crew math — v1 is single owner-operator; the model leaves room for roles
  later without changing the method (constitution §3.2).
