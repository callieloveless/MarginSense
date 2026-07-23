# onboarding

## ADDED Requirements

### Requirement: Business settings include an editable service area
The business's settings SHALL include an optional service area (a free-text location) that the
user can set and edit in Settings, stored as an input only (no derived value). Tools MAY read it
to localize their behavior (e.g. Material Finder biasing prices to local suppliers). It SHALL be
tenant-isolated like the rest of business settings and default to empty.

#### Scenario: Set and edit the service area
- **WHEN** the user sets or edits the service area in Settings
- **THEN** it is saved on the business's settings and read back on the Settings screen

#### Scenario: Service area is optional
- **WHEN** a business has never set a service area
- **THEN** its service area is empty and nothing that depends on it breaks
