## ADDED Requirements

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
