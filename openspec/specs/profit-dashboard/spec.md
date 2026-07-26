# profit-dashboard Specification

## Purpose
TBD - created by archiving change add-estimate-dashboard. Update Purpose after archive.
## Requirements
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
profitShare / hourShare`) and surface which jobs are not pulling their weight. Each ranked job SHALL
also show its own profit-per-hour and a red/yellow/green signal chip (color paired with text)
alongside its plain-language note.

#### Scenario: Underperforming job flagged
- **WHEN** a job consumes 40% of the portfolio's hours but returns 20% of its profit
  (weight 0.50)
- **THEN** the dashboard shows that job red in the ranking

#### Scenario: Ranked card shows the job's profit per hour
- **WHEN** a job is shown in the ranking
- **THEN** its card shows the job's own profit-per-hour and a signal chip with text (not color alone)

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

### Requirement: Portfolio pulse
The dashboard SHALL lead with a portfolio pulse computed from the engine's aggregate: the aggregate
profit-per-hour, a plain-language verdict, the shortfall against target, and progress toward target,
each drillable to its inputs (Σ net profit, Σ labor hours, target, shortfall). Jobs without a priced
active estimate SHALL be excluded from the aggregate and SHALL NOT break it. The pulse SHALL use
plain language, SHALL describe its scope honestly (across active jobs — not a calendar-month claim),
and SHALL never surface the acronym "EPH".

#### Scenario: Pulse headline
- **WHEN** the business has priced active jobs
- **THEN** the dashboard shows the aggregate profit-per-hour with a signal, a plain verdict, and how
  far short of target it is, drillable to Σ net profit, Σ labor hours, and the target

#### Scenario: No active jobs
- **WHEN** the business has no priced active estimate
- **THEN** the pulse shows a calm not-applicable/empty state rather than a broken or zero signal

#### Scenario: Draft job does not break the pulse
- **WHEN** a project has no active priced estimate (a draft)
- **THEN** it is excluded from the aggregate denominator and the pulse still computes for the rest

#### Scenario: Negative aggregate renders honestly
- **WHEN** the active jobs' summed net profit is negative
- **THEN** the pulse shows a red signal with the negative profit-per-hour stated plainly, the
  shortfall may exceed the target, and the progress indicator clamps at zero (never a negative bar)

### Requirement: Dashboard quick capture
The dashboard header SHALL offer a photo quick-capture entry that opens a job-picker bottom sheet;
choosing a job SHALL take the user to that job's photo surface. The entry SHALL never be a dead
control: with no jobs, the sheet SHALL teach and offer creating a job.

#### Scenario: Capture into a chosen job
- **WHEN** the user taps the dashboard camera entry and picks a job from the sheet
- **THEN** they land on that job's photo surface ready to capture

#### Scenario: No jobs yet
- **WHEN** the user taps the camera entry with no jobs
- **THEN** the sheet explains and offers "new job" rather than doing nothing

