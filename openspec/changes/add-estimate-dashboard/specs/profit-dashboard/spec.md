# profit-dashboard

## ADDED Requirements

### Requirement: Per-estimate signal rendering
The profit surface SHALL render an estimate's red/yellow/green from the engine's absolute
view (`EPH / targetProfitPerHour`) alongside its internal roll-up — loaded cost, overhead
allocated, contingency, and net profit — with every figure drillable to its inputs
(constitution §6.6). All numbers SHALL come from `src/engine/`; none are re-derived here.

#### Scenario: Reference estimate reads deep green
- **WHEN** an estimate rolls up to EPH ≈ $209/hour against an $87.50/hour target
- **THEN** the estimate shows a green signal, drillable to the EPH, target, and ratio

#### Scenario: Signal is never color alone
- **WHEN** any signal is shown
- **THEN** the color is paired with text so red/yellow/green is not the only cue

### Requirement: Portfolio dashboard with fair-share ranking
The dashboard SHALL rank a business's projects by the engine's comparative view (`weight =
profitShare / hourShare`) and surface which jobs are not pulling their weight.

#### Scenario: Underperforming job flagged
- **WHEN** a job consumes 40% of the portfolio's hours but returns 20% of its profit
  (weight 0.50)
- **THEN** the dashboard shows that job red in the ranking

### Requirement: "Against your year" figures use the active version
For each project the dashboard SHALL show, in plain language, `percentOfYear` (labor hours ÷
annual billable hours) and `percentOfProfitGoal` ((net profit + overhead allocated) ÷
gross-profit goal), computed from the engine using the project's active/accepted estimate
version.

#### Scenario: Reference job against the year
- **WHEN** the active estimate has 64 labor hours and a $16,576.50 profit contribution, the
  business has 1,200 annual billable hours and a $165,000 gross-profit goal
- **THEN** the job shows "5.3% of your year" and "10.05% of your profit goal"

#### Scenario: Only the active version feeds the portfolio
- **WHEN** a project has several estimate versions
- **THEN** the dashboard's percentages use the active version, not the others

### Requirement: EPH stays internal in the UI
The profit surface SHALL present plain-language wording ("profit per hour vs your target",
"loaded cost", "% of your year") and SHALL NOT surface the acronym "EPH" as a user-facing
label.

#### Scenario: Plain language on the signal panel
- **WHEN** the user opens the explain panel for an estimate's color
- **THEN** it reads "profit per hour: $209 vs your $87.50 target" rather than "EPH"
