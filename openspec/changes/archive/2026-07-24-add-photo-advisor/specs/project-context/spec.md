## MODIFIED Requirements

### Requirement: Typed context entries per project
Each project SHALL have a shared context holding typed, structured entries — `finding`,
`material`, `code_ref`, `photo`, and `fact` (constitution §4.1) — where every entry carries a
non-null `business_id`, its project, a typed payload for its kind, and an author (the user or,
later, a named tool). Entries SHALL be read and added only through tenant-scoped helpers.

A `finding` SHALL additionally carry a **severity** — `safety`, `attention`, or `note` — so the
job's memory records how serious a diagnosis is without a reader having to interpret its prose,
and it MAY name the photo it was derived from. Wherever a severity is displayed it SHALL be
paired with text and never conveyed by colour alone (constitution §6, phone-first accessibility).

#### Scenario: Add a material entry
- **WHEN** a material is recorded for a project with a name, price, unit, supplier, and source
  URL
- **THEN** it persists as a `material` context entry on that project with its typed payload
  and its author

#### Scenario: Entry kinds are constrained
- **WHEN** a context entry is written with a kind outside `finding | material | code_ref |
  photo | fact`
- **THEN** the write is rejected at the validation boundary

#### Scenario: A finding records its severity
- **WHEN** a `finding` entry is recorded
- **THEN** it carries one of `safety`, `attention`, or `note`, and a payload with a severity
  outside that set is rejected at the validation boundary

#### Scenario: A finding may name its photo
- **WHEN** a finding was derived from a job photo
- **THEN** the entry may carry that photo's reference, and an entry without one is still valid

#### Scenario: Severity is never colour alone
- **WHEN** a finding's severity is shown to the user
- **THEN** it is labelled in words, with any colour serving only as reinforcement
