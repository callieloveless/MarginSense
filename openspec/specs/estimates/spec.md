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
after which margin is recomputed as an outcome rather than solved. Derived price/margin
SHALL come from `src/engine/`, never re-implemented in the builder.

#### Scenario: Margin-solve by default
- **WHEN** the user enters costs and does not override any price
- **THEN** the estimate's price is solved by the engine so `netMargin` hits the target
  margin

#### Scenario: Override makes margin an outcome
- **WHEN** the user overrides the total price
- **THEN** the engine is not re-solved and the displayed margin is recomputed from the
  entered price

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

