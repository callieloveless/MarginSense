## ADDED Requirements

### Requirement: Guided onboarding with a welcome and a skip
Onboarding SHALL open with a welcome that states the value ("find out what your jobs really pay")
and offers both *Get started* and a *Skip for now* that leaves setup for later. The stepped flow
SHALL show progress with the position conveyed by text ("Step N of M"), not colour alone.

#### Scenario: Skip for now
- **WHEN** the user chooses "Skip for now" on the welcome
- **THEN** they leave onboarding without being forced to complete it, and can return to it later

#### Scenario: Progress is legible
- **WHEN** the user is on step N of M
- **THEN** "Step N of M" is shown as text alongside the progress indicator

## MODIFIED Requirements

### Requirement: Review screen plays back derived rates
After input, the Review screen — and the shared derived-rates playback that Settings reuses —
SHALL display the derived business rates computed by the engine, **grouped** as *capacity*, *what
an hour costs*, and *targets*: annual billable hours, monthly overhead, overhead recovery rate,
burdened labor rate, loaded cost per hour, break-even day rate, gross-profit goal, target profit
per hour, and the **bill rate an hour must fetch to pull its weight** (loaded cost per hour +
target profit per hour). Each number SHALL be drillable to the inputs that produced it, and none
SHALL be stored.

#### Scenario: Review reconciles the reference business
- **WHEN** the reference business ($60,000 overhead, $35/hour wage, 25% burden, 200 days ×
  6 billable hours/day, $90,000 income goal, $15,000 profit target) reaches Review
- **THEN** it shows 1,200 billable hours/year, $5,000.00 monthly overhead, a $50.00/hour recovery
  rate, $43.75/hour burdened rate, $93.75/hour loaded cost, ~$563 break-even day, $165,000
  gross-profit goal, $87.50/hour target profit per hour, and a $181.25/hour rate to pull its weight

#### Scenario: Every number is drillable
- **WHEN** the user taps any derived number on the review
- **THEN** the inputs that produced it are shown (constitution §6.6)

### Requirement: Business settings include an editable service area
The business's settings SHALL include an optional service area (a free-text location) that the user
can set **during onboarding** and edit in Settings, stored as an input only (no derived value).
Tools MAY read it to localize their behavior (e.g. Material Finder biasing prices to local
suppliers). It SHALL be tenant-isolated like the rest of business settings and default to empty.

#### Scenario: Set the service area during onboarding
- **WHEN** the user enters a service area in the onboarding wizard
- **THEN** it is saved on the business's settings and prefilled when they revisit setup or Settings

#### Scenario: Set and edit the service area
- **WHEN** the user sets or edits the service area in Settings
- **THEN** it is saved on the business's settings and read back on the Settings screen

#### Scenario: Service area is optional
- **WHEN** a business has never set a service area
- **THEN** its service area is empty and nothing that depends on it breaks
