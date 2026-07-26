## ADDED Requirements

### Requirement: Guided two-step new-job setup
The system SHALL create a job through a guided two-step flow: *Who & where* (client name, job
address, job type, scope note) and *Money & schedule* (target margin, contingency, crew size, start
window). Client name SHALL be required; the rest optional. Inputs SHALL be captured phone-first,
using chips for the enumerable choices (job type, crew size), and converted to integers at the
boundary (percentages → basis points). The `business_id` SHALL come from the session, never the form.

#### Scenario: Create a job with type and money defaults
- **WHEN** the user completes both steps with a client name, a job type, a 30% target margin, and a
  10% contingency
- **THEN** a project is created carrying those fields (target margin 3000 bp, contingency 1000 bp),
  stamped with the session's business id

#### Scenario: Minimal job
- **WHEN** the user enters only a client name and finishes
- **THEN** a project is created and every optional field is null, rendering calmly everywhere

### Requirement: Per-job fields are tenant-isolated inputs
The per-job fields (`job_type`, `crew_size`, `start_window`, `default_target_margin_bp`,
`default_contingency_bp`) SHALL be stored on the project as inputs only (no derived value), carrying
the project's non-null `business_id` under the existing Row-Level Security policy. A user SHALL NOT
be able to read or set them on another business's project.

#### Scenario: Cross-tenant write is blocked
- **WHEN** a user from business A attempts to write business B's project fields
- **THEN** Row-Level Security prevents it and no cross-tenant data is written

#### Scenario: Legacy project reads calmly
- **WHEN** a project created before these fields existed is read
- **THEN** its per-job fields are null and nothing that reads them breaks

### Requirement: Auto-run panel describes only real automation
The Money & schedule step MAY show an auto-run panel; it SHALL describe only automation that
actually runs (e.g. a photo added to the job triggers a local-code check) and SHALL NOT present a
control, link, or promise for automation or a rules screen that does not yet exist.

#### Scenario: No dead control
- **WHEN** the auto-run panel renders
- **THEN** it states what runs today and offers no link to a rules screen that is not built
