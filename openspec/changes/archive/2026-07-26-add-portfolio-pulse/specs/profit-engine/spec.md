## ADDED Requirements

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
