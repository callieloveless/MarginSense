# Tasks — add-profit-engine

## 1. Money & time primitives

- [ ] 1.1 Create `src/engine/money.ts` with integer-cents and integer-minutes types plus
      add/subtract/multiply helpers that stay in integers
- [ ] 1.2 Add a single half-up `formatCents` display helper (cents → "$1,234.56"); core
      math stays in cents
- [ ] 1.3 Add basis-point helpers (bp ↔ ratio) with the 1% = 100 bp convention
- [ ] 1.4 Add a not-applicable result type for safe division (used by EPH, margins, rates)
- [ ] 1.5 Write `src/engine/money.test.ts` covering precision, half-up rounding boundaries,
      and bp conversions

## 2. Engine config

- [ ] 2.1 Create `src/engine/config.ts`: default thresholds (green ≥1.00 / yellow
      0.80–0.99 / red <0.80), the target-profit-per-hour formula selector, the contingency
      base (`directCost + overheadAllocated`), and rounding rules — no scattered constants
- [ ] 2.2 Type the config so business-sourced overrides replace the defaults cleanly

## 3. Derived business rates (annual basis)

- [ ] 3.1 Create `src/engine/rates.ts`: `annualBillableHours` (working_days ×
      billable_minutes_per_day / 60) and `overheadRecoveryRate` (annual_overhead ÷
      annualBillableHours)
- [ ] 3.2 Add `burdenedLaborRate` (wage × (1 + burden)), `loadedCostPerHour` (recovery +
      burdened), and `breakEvenDayRate` (loaded × billable hrs/day)
- [ ] 3.3 Add `grossProfitGoal` (overhead + income + profit) and `targetProfitPerHour`
      ((income + profit) ÷ annualBillableHours)
- [ ] 3.4 Return not-applicable when `annualBillableHours` is 0 (no divide-by-zero)
- [ ] 3.5 Write `src/engine/rates.test.ts` — reference business ($60k/1,200h → $50/hr;
      $35×1.25 → $43.75; loaded $93.75; break-even $562.50; goal $165k; target $87.50) plus
      the zero-hours case

## 4. Estimate roll-up, contingency & EPH

- [ ] 4.1 Create `src/engine/estimate.ts`: per-line cost (labor `minutes/60 × burdenedRate`,
      non-labor `quantity × unitCost`) with granular categories
- [ ] 4.2 Roll up `revenue`, `directCost`, `laborHours`, `overheadAllocated` (laborHours ×
      recoveryRate)
- [ ] 4.3 Add `contingency = contingency_bp × (directCost + overheadAllocated)` and
      `netProfit = revenue − directCost − overheadAllocated − contingency`
- [ ] 4.4 Add `grossMargin`, `netMargin`; return not-applicable at zero revenue
- [ ] 4.5 Compute `EPH = netProfit / laborHours`; return not-applicable at zero labor hours
- [ ] 4.6 Write `src/engine/estimate.test.ts` — reconcile the mockup (revenue $29,725,
      directCost $12,370, overhead $3,200, contingency $778.50, netProfit ≈ $13,376.50, EPH
      ≈ $209/hr, netMargin 45.0%), plus zero-hour, zero-revenue, and negative-net-profit

## 5. Margin-solve pricing

- [ ] 5.1 Add a margin-solve path: given costs + `target_margin_bp`, solve total price so
      `netMargin` hits target; round solved price to whole cents, let margin absorb the
      remainder
- [ ] 5.2 Add a price-override path: a user-entered line/total switches to entered-price and
      `netMargin` is recomputed as an outcome
- [ ] 5.3 Write tests: solving 45% target reproduces the mockup price; recomputed margin is
      within one cent of target; an override recomputes margin correctly

## 6. Pull-their-weight signal

- [ ] 6.1 Create `src/engine/signal.ts` — absolute view `ratio = EPH / targetProfitPerHour`
      with thresholds from `config.ts` (defaults ≥1.00 / 0.80–0.99 / <0.80)
- [ ] 6.2 Add the comparative view `weight = profitShare / hourShare` reusing the same
      thresholds
- [ ] 6.3 Add the portfolio figures `percentOfYear = laborHours / annualBillableHours` and
      `percentOfProfitGoal = (netProfit + overheadAllocated) / grossProfitGoal`
- [ ] 6.4 Return `{ color, ...inputs }` so every color/figure is explainable (§6.6)
- [ ] 6.5 Write `src/engine/signal.test.ts` — threshold boundaries at 0.79 / 0.80 / 0.99 /
      1.00 (both views), the mockup ratio ≈ 2.4 → green, `percentOfYear` 5.3% and
      `percentOfProfitGoal` 10.05%, and negative net profit → red

## 7. Wire-up & verification

- [ ] 7.1 Add Vitest to the project and an `engine` test script
- [ ] 7.2 Add a barrel `src/engine/index.ts` exporting the public engine API
- [ ] 7.3 Run the full engine suite; confirm no float/DB/framework imports in `src/engine/`
- [ ] 7.4 Run `openspec validate add-profit-engine --strict` and confirm it passes
