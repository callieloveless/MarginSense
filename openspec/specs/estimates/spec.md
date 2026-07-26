# estimates Specification

## Purpose
TBD - created by archiving change add-estimate-dashboard. Update Purpose after archive.
## Requirements
### Requirement: Estimate and line-item editing
The system SHALL let a user create and edit estimates and their line items. Line items SHALL
keep granular categories (labor, material, subcontractor, equipment, permit, disposal,
other); labor lines carry `laborMinutes` and non-labor lines carry `quantity` and
`unitCost`. Grouping of categories is a display concern only.

#### Scenario: Add a labor and a material line
- **WHEN** the user adds a 480-minute labor line and a material line of quantity 4 at
  $12.50
- **THEN** both persist with their granular categories and integer units (minutes, cents)

### Requirement: Costs entered, price solved to target margin
The estimate builder SHALL send entered costs and the business `target_margin_bp` to the
engine to solve each estimate's price, and SHALL support a per-line or total price override
after which margin is recomputed as an outcome rather than solved. The estimate total SHALL
equal the sum of effective line prices (a line's entered price when present, else its derived
cost-proportional baseline). **Only a price the user enters is stored on a line**
(`priceCents`); solved and allocated baseline prices are derived values, recomputed by the
engine every time and never persisted. When any entered line price exists it supersedes a
total-price override. Derived price/margin SHALL come from `src/engine/`, never re-implemented
in the builder.

#### Scenario: Margin-solve by default
- **WHEN** the user enters costs and does not override any price
- **THEN** the estimate's price is solved by the engine so `netMargin` hits the target
  margin

#### Scenario: Override makes margin an outcome
- **WHEN** the user overrides the total price
- **THEN** the engine is not re-solved and the displayed margin is recomputed from the
  entered price

#### Scenario: Explicit line price sums to the total
- **WHEN** the user sets an explicit price on one line and leaves the others unpriced
- **THEN** the unpriced lines keep their cost-proportional baselines, the estimate total
  equals the sum of all effective line prices, and margin is recomputed as an outcome

#### Scenario: Derived prices are never stored
- **WHEN** an estimate is margin-solved without the user entering any line price
- **THEN** no `priceCents` value is written, and a later cost change re-solves the estimate
  and re-derives every line's baseline price

#### Scenario: Entered line price supersedes a total override
- **WHEN** an estimate has a total-price override and the user then enters a price on a line
- **THEN** the estimate total is the sum of effective line prices and the total override is
  not applied

#### Scenario: Legacy estimate unchanged
- **WHEN** an existing estimate has no explicit line prices
- **THEN** every line takes its derived baseline price and the estimate's total, margin, and
  signal are identical to before per-line pricing

### Requirement: Multiple versions per project with one active
A project SHALL support multiple estimate versions (e.g. v1, revised, Option A/B), each
computing its signal independently, with exactly one version flagged active/accepted.

#### Scenario: Independent versions
- **WHEN** a project has two estimate versions with different line items
- **THEN** each version computes its own roll-up and signal independently

#### Scenario: Exactly one active version
- **WHEN** a version is marked active
- **THEN** any previously active version for that project is no longer active

### Requirement: Creating an estimate seeds shared context
Creating an estimate SHALL seed the project's shared context with the job's cost and hour
data, per constitution §4.

#### Scenario: New estimate seeds context
- **WHEN** the user creates the first estimate for a project
- **THEN** the project's shared context reflects that estimate's cost/hour data

### Requirement: Estimates are tenant-isolated
Every `estimates` and `line_items` row SHALL carry a non-null `business_id` with Row-Level
Security enforced, so one business can never read or write another's estimates.

#### Scenario: Cross-tenant read is blocked
- **WHEN** a user from business A requests business B's estimate
- **THEN** Row-Level Security returns no rows and no cross-tenant data is exposed

### Requirement: New estimates seed margin and contingency from the project default
When an estimate is created for a project, its `target_margin_bp` and `contingency_bp` SHALL seed
from the project's default values when those are set, and otherwise from the business settings
default. The estimate remains the source of truth for its own values once created; the project
default is only the starting point (it is never re-read after creation, so editing a project default
does not silently change an existing estimate).

#### Scenario: Project default seeds the estimate
- **WHEN** a project has a `default_target_margin_bp` of 3000 and a new estimate is created
- **THEN** the new estimate's `target_margin_bp` is 3000 bp

#### Scenario: Fall back to the business default
- **WHEN** a project has no default target margin and a new estimate is created
- **THEN** the new estimate's `target_margin_bp` is the business settings default

#### Scenario: Existing estimates are untouched by a later default change
- **WHEN** a project's default contingency is changed after an estimate already exists
- **THEN** the existing estimate keeps its own `contingency_bp` (the default is a seed, not a link)

