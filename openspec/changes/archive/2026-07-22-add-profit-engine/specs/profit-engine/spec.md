# profit-engine

## ADDED Requirements

### Requirement: Money and time primitives
The engine SHALL represent money as integer cents, labor time as integer minutes, and
percentages as basis points (1% = 100 bp), and SHALL NOT use floating-point numbers for
money in any stored or computed value. Rounding SHALL occur only when converting to a
display representation.

#### Scenario: Cents never lose precision
- **WHEN** two money values of 1049 cents and 2 cents are added
- **THEN** the result is exactly 1051 cents with no floating-point drift

#### Scenario: Display rounding is explicit and half-up
- **WHEN** 123456 cents is formatted for display as dollars
- **THEN** it renders as "$1,234.56" and the underlying value remains 123456 cents

#### Scenario: Basis points convert without ambiguity
- **WHEN** a percentage is stored as 1500 bp
- **THEN** the engine treats it as 15% (0.15) and never as the literal 1500

### Requirement: Engine configuration
The engine SHALL centralize its tunable values in one config module: the default
red/yellow/green thresholds, the target-profit-per-hour formula, the contingency base, and
the display rounding rule. Callers MAY override the defaults with per-business values; no
threshold, formula, or base SHALL be hardcoded elsewhere in the engine.

#### Scenario: Business thresholds override defaults
- **WHEN** a business supplies a green threshold of 1.10
- **THEN** the signal uses 1.10 for that business and the engine default (1.00) elsewhere

### Requirement: Derived business rates
The engine SHALL derive business rates on an annual basis from the solo-operator inputs:
`annualBillableHours = working_days_per_year × billable_minutes_per_day / 60`;
`overheadRecoveryRate = annual_overhead / annualBillableHours`; `burdenedLaborRate =
owner_wage × (1 + labor_burden)`; `loadedCostPerHour = overheadRecoveryRate +
burdenedLaborRate`; `breakEvenDayRate = loadedCostPerHour × billable_hours_per_day`;
`grossProfitGoal = annual_overhead + income_goal + profit_target`; and
`targetProfitPerHour = (income_goal + profit_target) / annualBillableHours`.

#### Scenario: Overhead recovery rate on an annual basis
- **WHEN** annual_overhead is 6000000 cents and annualBillableHours is 1200
- **THEN** overheadRecoveryRate is 5000 cents per hour

#### Scenario: Burdened and loaded cost per hour
- **WHEN** owner_wage is 3500 cents/hour and labor_burden is 2500 bp
- **THEN** burdenedLaborRate is 4375 cents/hour and (with a 5000 cents/hour recovery rate)
  loadedCostPerHour is 9375 cents/hour

#### Scenario: Gross-profit goal and target profit per hour
- **WHEN** annual_overhead is 6000000 cents, income_goal is 9000000 cents, profit_target is
  1500000 cents, and annualBillableHours is 1200
- **THEN** grossProfitGoal is 16500000 cents and targetProfitPerHour is 8750 cents/hour

#### Scenario: Zero billable hours does not divide by zero
- **WHEN** annualBillableHours is 0
- **THEN** the engine reports overheadRecoveryRate and targetProfitPerHour as
  not-applicable rather than raising a divide-by-zero

### Requirement: Line-item cost and price
The engine SHALL compute each line item's cost by category: labor lines as
`laborMinutes / 60 × burdenedRate` and non-labor lines as `quantity × unitCost`, and SHALL
carry a client-facing `price` per line. Categories SHALL stay granular (labor, material,
subcontractor, equipment, permit, disposal, other); any grouping is a display concern.

#### Scenario: Labor line cost from minutes
- **WHEN** a labor line has 90 minutes at a burdened rate of 6000 cents/hour
- **THEN** its cost is 9000 cents

#### Scenario: Non-labor line cost from quantity
- **WHEN** a material line has quantity 4 at a unit cost of 1250 cents
- **THEN** its cost is 5000 cents

### Requirement: Estimate roll-up with contingency
The engine SHALL roll a set of line items up into `revenue` (Σ price), `directCost`
(Σ cost), `laborHours` (Σ labor hours), `overheadAllocated` (`laborHours ×
overheadRecoveryRate`), `contingency` (`contingency_bp × (directCost + overheadAllocated)`),
`netProfit` (`revenue − directCost − overheadAllocated − contingency`), `grossMargin`
(`(revenue − directCost) / revenue`), and `netMargin` (`netProfit / revenue`). Contingency
is a real reserved cost that reduces net profit; overheadAllocated is the only place
overhead enters a job.

#### Scenario: Full roll-up reconciles the reference estimate
- **WHEN** an estimate has revenue 2972500 cents, directCost 1237000 cents, laborHours 64,
  an overheadRecoveryRate of 5000 cents/hour, and a contingency of 500 bp
- **THEN** overheadAllocated is 320000 cents, contingency is 77850 cents, netProfit is
  1337650 cents, and netMargin is 4500 bp (45.0%)

#### Scenario: Zero-revenue estimate
- **WHEN** an estimate has revenue 0 cents
- **THEN** grossMargin and netMargin are reported as not-applicable rather than dividing by
  zero

#### Scenario: Negative net profit
- **WHEN** revenue is less than directCost + overheadAllocated + contingency
- **THEN** netProfit is negative and the estimate's later signal (see below) is red

### Requirement: Margin-driven pricing
The engine SHALL support solving price from target margin: given line costs and
`target_margin_bp`, it SHALL solve the estimate's total price so `netMargin` equals the
target, rounding the solved price to whole cents and letting margin absorb the sub-cent
remainder. When a user overrides a line or total price, that value SHALL be treated as
entered and `netMargin` SHALL be recomputed as an outcome rather than solved.

#### Scenario: Solve price to hit target margin
- **WHEN** costs are entered and `target_margin_bp` is 4500 (45%)
- **THEN** the engine returns a whole-cent total price whose recomputed `netMargin` is
  within one cent of 45%

#### Scenario: User override makes margin an outcome
- **WHEN** the user overrides the total price to a specific value
- **THEN** the engine does not re-solve the price and reports the resulting `netMargin` as
  computed from that entered price

### Requirement: Effective Profit per Hour
The engine SHALL compute Effective Profit per Hour as `EPH = netProfit / laborHours`,
expressed in integer cents per hour. EPH is an internal engine term; presentation wording
lives in the UI.

#### Scenario: EPH from net profit and hours
- **WHEN** netProfit is 1800000 cents over 40 labor hours
- **THEN** EPH is 45000 cents per hour

#### Scenario: Zero labor hours
- **WHEN** an estimate has 0 labor minutes
- **THEN** EPH is reported as not-applicable and never a divide-by-zero

### Requirement: Pull-their-weight signal — absolute view
The engine SHALL classify a single estimate against the business target using
`ratio = EPH / targetProfitPerHour`, returning green when `ratio ≥ 1.00`, yellow when
`0.80 ≤ ratio ≤ 0.99`, and red when `ratio < 0.80`. Thresholds SHALL come from config with
those defaults, not hardcoded constants.

#### Scenario: Green at or above target
- **WHEN** EPH is 45000 cents/hour and targetProfitPerHour is 45000 cents/hour (ratio 1.00)
- **THEN** the signal is green

#### Scenario: Reference estimate reads deep green
- **WHEN** EPH is about 20901 cents/hour and targetProfitPerHour is 8750 cents/hour
  (ratio ≈ 2.4)
- **THEN** the signal is green

#### Scenario: Yellow just below target
- **WHEN** ratio computes to 0.80
- **THEN** the signal is yellow

#### Scenario: Red boundary
- **WHEN** ratio computes to 0.79
- **THEN** the signal is red

### Requirement: Pull-their-weight signal — comparative/portfolio view
The engine SHALL score a job's fair share within a set using `weight = profitShare /
hourShare`, where `hourShare = hours_i / totalHours` and `profitShare = profit_i /
totalProfit`, applying the same thresholds as the absolute view. It SHALL also compute the
portfolio figures `percentOfYear = laborHours / annualBillableHours` and
`percentOfProfitGoal = (netProfit + overheadAllocated) / grossProfitGoal` (the job's
contribution before overhead allocation, over the annual gross-profit goal).

#### Scenario: Item pulls its weight
- **WHEN** an item consumes 20% of the hours and returns 25% of the profit (weight 1.25)
- **THEN** the item's signal is green

#### Scenario: Item drags the set
- **WHEN** an item consumes 40% of the hours and returns 20% of the profit (weight 0.50)
- **THEN** the item's signal is red

#### Scenario: Portfolio percentages for the reference job
- **WHEN** laborHours is 64, annualBillableHours is 1200, netProfit is 1337650 cents,
  overheadAllocated is 320000 cents, and grossProfitGoal is 16500000 cents
- **THEN** percentOfYear is about 5.3% and percentOfProfitGoal is about 10.05%

### Requirement: Every color is explainable
The engine SHALL return, alongside each color and portfolio figure, the inputs that
produced it — the EPH, the target, and the ratio (absolute view), or the hour share, profit
share, weight, `percentOfYear`, and `percentOfProfitGoal` (comparative view) — so the UI
can show the math behind any signal.

#### Scenario: Signal carries its inputs
- **WHEN** the engine returns a color for an estimate
- **THEN** the result includes the EPH, the target, and the computed ratio (or, in the
  comparative view, the hour share, profit share, weight, and the two portfolio percentages)
