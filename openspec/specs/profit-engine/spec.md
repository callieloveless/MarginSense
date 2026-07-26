# profit-engine Specification

## Purpose
TBD - created by archiving change add-profit-engine. Update Purpose after archive.
## Requirements
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
remainder. From the estimate total (solved, or a user total override), the engine SHALL derive
a **per-line price baseline** by allocating the total proportional to each line's cost — exact
to the cent, the rounding remainder assigned to the largest-cost line (ties broken by line
order). Baseline prices are **derived values**: the engine SHALL treat a line price as entered
only when explicitly provided, and solving SHALL NOT convert a derived price into an entered
one. A line's **effective price** is its entered price when present, else its baseline; estimate
`revenue` SHALL equal the sum of effective line prices. When any entered line price exists, the
total IS that sum — a total-price override is not additionally applied — and `netMargin` is
recomputed as an outcome rather than solved. When `directCost` is zero, the allocation SHALL be
reported not-applicable rather than dividing by zero.

#### Scenario: Solve price to hit target margin
- **WHEN** costs are entered and `target_margin_bp` is 4500 (45%)
- **THEN** the engine returns a whole-cent total price whose recomputed `netMargin` is
  within one cent of 45%

#### Scenario: User override makes margin an outcome
- **WHEN** the user overrides the total price to a specific value
- **THEN** the engine does not re-solve the price and reports the resulting `netMargin` as
  computed from that entered price

#### Scenario: Baseline distributes the total across lines
- **WHEN** the engine derives per-line baselines for an estimate total
- **THEN** each line's baseline is proportional to its cost, exact to the cent (remainder to
  the largest-cost line, ties broken by line order), and the baselines sum to the total

#### Scenario: Solving never persists derived prices
- **WHEN** an estimate is margin-solved and no line price has been entered by the user
- **THEN** every line's price remains a derived baseline (re-solving after a cost change
  produces new prices), and no line is treated as explicitly priced

#### Scenario: Entered line price replaces only its own baseline
- **WHEN** the user enters a price on one line and leaves the others unpriced
- **THEN** the other lines keep their baselines, revenue equals the sum of effective prices,
  and `netMargin` is recomputed as an outcome

#### Scenario: Entered line prices supersede a total override
- **WHEN** an estimate has both a total-price override and at least one entered line price
- **THEN** revenue is the sum of effective line prices and the total override is not applied

#### Scenario: Zero direct cost does not divide by zero
- **WHEN** an estimate's `directCost` is zero
- **THEN** the per-line baseline allocation is reported not-applicable (entered line prices,
  if any, still stand) and no division by zero occurs

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

### Requirement: Per-line profit-per-hour signal
The engine SHALL compute, for each **labor** line, `lineProfitPerHour = (effectiveLinePrice −
burdenedLaborCost − lineOverheadAllocated − lineContingencyShare) / lineHours`, where
`lineOverheadAllocated = lineHours × overheadRecoveryRate` and `lineContingencyShare` is the
line's slice of the estimate contingency allocated proportional to its share of the
contingency base (`(lineDirectCost + lineOverheadAllocated) / (directCost +
overheadAllocated)`), and SHALL classify it with the same red/yellow/green thresholds as the
absolute estimate signal (`ratio = lineProfitPerHour / targetProfitPerHour`, from config).
Non-labor lines SHALL NOT carry a per-hour signal. The engine SHALL return each line signal's
inputs (effective price, cost, overhead, contingency share, hours, ratio) so the UI can show
the math behind the color.

#### Scenario: Green labor line
- **WHEN** a labor line's `lineProfitPerHour` is 16600 cents/hour and `targetProfitPerHour` is
  8750 cents/hour (ratio ≈ 1.9)
- **THEN** its per-line signal is green and carries the inputs that produced it

#### Scenario: Red labor line
- **WHEN** a labor line's `lineProfitPerHour` is 3100 cents/hour and `targetProfitPerHour` is
  8750 cents/hour (ratio ≈ 0.35)
- **THEN** its per-line signal is red

#### Scenario: Yellow and red boundaries
- **WHEN** a labor line's ratio computes to 0.80
- **THEN** its per-line signal is yellow, and at a ratio of 0.79 it is red

#### Scenario: Non-labor line has no per-hour signal
- **WHEN** a material, subcontractor, equipment, permit, disposal, or other non-labor line is
  evaluated
- **THEN** the engine returns no per-line profit-per-hour signal for it (it has no labor hours)

#### Scenario: Zero-hour labor line
- **WHEN** a labor line has 0 labor minutes
- **THEN** its per-line profit-per-hour is reported not-applicable, never a divide-by-zero

### Requirement: Per-line reconciliation invariant
The sum of the per-line net profits SHALL equal the estimate's `netProfit`, where each line's
net is `effectiveLinePrice − lineDirectCost − lineOverheadAllocated − lineContingencyShare`
(non-labor lines carry no overhead and no hours; contingency shares are allocated on the
contingency base, exact to the cent with the remainder assigned to the largest-base line).
Computing per-line prices and signals SHALL NOT change any existing whole-estimate figure; the
whole-estimate profit-per-hour therefore remains the labor-hour-weighted blend of the per-line
values.

#### Scenario: Per-line nets sum to estimate net
- **WHEN** the per-line net profits of an estimate are summed
- **THEN** the total equals the estimate's `netProfit` exactly, to the cent

#### Scenario: Whole-estimate figures unchanged
- **WHEN** per-line pricing and signals are computed for an estimate
- **THEN** its `revenue`, `directCost`, `overheadAllocated`, `contingency`, `netProfit`, and
  whole-estimate EPH are identical to the pre-per-line roll-up

### Requirement: Portfolio aggregate profit per hour
The engine SHALL compute, across a set of jobs, an `aggregateProfitPerHour = Σ netProfit / Σ
laborHours`, a `shortfallPerHour = max(0, targetProfitPerHour − aggregateProfitPerHour)`, and a
red/yellow/green signal via the same absolute thresholds (`ratio = aggregateProfitPerHour /
targetProfitPerHour`, from config). When the set has no labor hours it SHALL report the aggregate,
shortfall, and signal as not-applicable rather than dividing by zero. The result SHALL carry its
inputs (Σ net profit, Σ labor hours, target) so the UI can show the math.

#### Scenario: Aggregate and shortfall
- **WHEN** the active jobs total 1,800,000 cents of net profit over 240 labor hours and
  `targetProfitPerHour` is 8750 cents/hour
- **THEN** `aggregateProfitPerHour` is 7500 cents/hour, `shortfallPerHour` is 1250 cents/hour, and
  the signal is yellow (ratio ≈ 0.857)

#### Scenario: At or above target clamps shortfall
- **WHEN** `aggregateProfitPerHour` is greater than or equal to `targetProfitPerHour`
- **THEN** `shortfallPerHour` is 0 and the signal is green

#### Scenario: No active hours
- **WHEN** no job in the set has labor hours
- **THEN** the aggregate, shortfall, and signal are reported as not-applicable, never a
  divide-by-zero

