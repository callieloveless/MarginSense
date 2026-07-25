## MODIFIED Requirements

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

## ADDED Requirements

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
