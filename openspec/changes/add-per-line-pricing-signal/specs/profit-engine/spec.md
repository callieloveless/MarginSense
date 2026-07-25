## MODIFIED Requirements

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

## ADDED Requirements

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
