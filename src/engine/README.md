# `src/engine/` — the profit engine (sacred boundary)

The pure, deterministic, unit-tested core that owns **all** financial math. See
[`constitution.md` §3](../../constitution.md) (the canonical financial model) and
[`constitution.md` §6.1](../../constitution.md) (engineering non-negotiables).

**This module imports nothing from Next, React, Drizzle, or Anthropic.** It takes plain
data in and returns plain data out. That is what makes the money math testable and
trustworthy. UI and DB code *call* it; they never re-implement totals, EPH, or color
logic.

This module owns **math only**. Estimate *editing* lives in `src/estimate/` and profit
*signaling / dashboard* in `src/profit/`; both consume this engine but stay separate from
it and from each other (constitution §6.8).

Rules that live here and nowhere else:

- **Money = integer cents. Time = integer minutes. Percentages = basis points.** No floats
  for money, ever.
- Annual business rates: overhead recovery rate, burdened labor rate, loaded cost/hr,
  break-even day rate, gross-profit goal, target profit/hr.
- Estimate roll-up: `revenue`, `directCost`, `laborHours`, `overheadAllocated`,
  `contingency`, `netProfit`, `grossMargin`, `netMargin`, and **EPH = netProfit /
  laborHours** — plus margin-solve pricing.
- The red / yellow / green "pull-their-weight" signal (absolute ratio, comparative weight,
  and the portfolio `% of year` / `% of profit goal` figures) and its thresholds.

Planned files (created via OpenSpec change `add-profit-engine`):

- `money.ts` — cents / minutes / basis-point helpers + display rounding.
- `config.ts` — thresholds, target-profit/hr formula, contingency base, rounding rules.
- `rates.ts` — annual derived rates.
- `estimate.ts` — the estimate roll-up + margin-solve.
- `signal.ts` — red/yellow/green (ratio, weight, portfolio %-figures).
- `*.test.ts` — near-exhaustive unit tests (rounding, zero-hour/zero-revenue, negative net
  profit, threshold boundaries at 0.79 / 0.80 / 0.99 / 1.00).
