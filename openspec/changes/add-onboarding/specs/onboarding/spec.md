# onboarding

## ADDED Requirements

### Requirement: Capture the solo-operator input model
The onboarding wizard SHALL capture the constitution §3.2 inputs — identity & trade; annual
overhead; owner wage and labor burden; working days per year and billable minutes per day;
and the goals block (income goal, profit target, target margin, default contingency) — and
SHALL store them as integers (`*_cents`, `*_minutes`, `*_bp`), converting human-entered
dollars and percentages at the boundary.

#### Scenario: Wizard stores integer units
- **WHEN** the user enters $60,000 annual overhead, a $35/hour wage, and a 45% target margin
- **THEN** the settings persist as 6000000 cents, 3500 cents/hour, and 4500 bp respectively

#### Scenario: Advanced inputs are outside the 3-step wizard
- **WHEN** the user completes the 3-step wizard
- **THEN** `default_markup_bp` and `default_tax_rate_bp` are not required and are editable
  later in full settings

### Requirement: Optional overhead itemization sums to the total
The wizard SHALL let the user optionally itemize overhead (name, amount, category). When
items are present they SHALL sum to `annual_overhead_cents`, and the annual total — not the
itemization — SHALL be the source of truth for all downstream math.

#### Scenario: Items reconcile to the total
- **WHEN** the user itemizes overhead into items totaling 6000000 cents
- **THEN** `annual_overhead_cents` is 6000000 and the engine reads only the total

#### Scenario: No itemization still works
- **WHEN** the user enters only the annual overhead total and no items
- **THEN** the settings are valid and the total drives the math

### Requirement: Store inputs only, never derived values
The system SHALL persist only the input model and SHALL NOT persist derived rates (overhead
recovery rate, loaded cost, break-even day rate, gross-profit goal, target profit per hour);
those SHALL be recomputed from `src/engine/` on demand.

#### Scenario: Derived rates are absent from storage
- **WHEN** onboarding completes and `business_settings` is written
- **THEN** the row contains the inputs only, and loaded cost / target profit-per-hour are
  computed by the engine when displayed

### Requirement: Review screen plays back derived rates
After input, the Review screen SHALL display the derived business rates computed by the
engine — overhead recovery rate, burdened labor rate, loaded cost per hour, break-even day
rate, gross-profit goal, and target profit per hour — with each number drillable to the
inputs that produced it.

#### Scenario: Review reconciles the reference business
- **WHEN** the reference business ($60,000 overhead, $35/hour wage, 25% burden, 200 days ×
  6 billable hours/day, $90,000 income goal, $15,000 profit target) reaches Review
- **THEN** it shows a $50.00/hour recovery rate, $43.75/hour burdened rate, $93.75/hour
  loaded cost, ~$563 break-even day, $165,000 gross-profit goal, and $87.50/hour target
  profit per hour

### Requirement: Business settings are tenant-isolated
Every `business_settings` (and `overhead_items`) row SHALL carry a non-null `business_id`
with Row-Level Security enforced, so one business can never read or write another's
settings.

#### Scenario: Cross-tenant read is blocked
- **WHEN** a user from business A queries business B's settings
- **THEN** Row-Level Security returns no rows and no cross-tenant data is exposed
