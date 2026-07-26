## MODIFIED Requirements

### Requirement: Derived business rates
The engine SHALL derive business rates on an annual basis from the solo-operator inputs:
`annualBillableHours = working_days_per_year × billable_minutes_per_day / 60`;
`overheadRecoveryRate = annual_overhead / annualBillableHours`; `burdenedLaborRate =
owner_wage × (1 + labor_burden)`; `loadedCostPerHour = overheadRecoveryRate +
burdenedLaborRate`; `breakEvenDayRate = loadedCostPerHour × billable_hours_per_day`;
`grossProfitGoal = annual_overhead + income_goal + profit_target`;
`targetProfitPerHour = (income_goal + profit_target) / annualBillableHours`;
`monthlyOverheadCents = annual_overhead / 12` (a display derivation, §3.2); and
`targetBillRatePerHour = loadedCostPerHour + targetProfitPerHour` — the rate an hour of work must
bill to clear its loaded cost and hit the target (the same threshold the per-line signal uses,
§3.4a). All are recomputed, never stored; rates that divide by billable capacity are
not-applicable rather than a divide-by-zero.

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

#### Scenario: Monthly overhead and the target bill rate
- **WHEN** annual_overhead is 6000000 cents, loadedCostPerHour is 9375 cents/hour, and
  targetProfitPerHour is 8750 cents/hour
- **THEN** monthlyOverheadCents is 500000 cents and targetBillRatePerHour is 18125 cents/hour

#### Scenario: Zero billable hours does not divide by zero
- **WHEN** annualBillableHours is 0
- **THEN** the engine reports overheadRecoveryRate, targetProfitPerHour, and targetBillRatePerHour
  as not-applicable rather than raising a divide-by-zero
