# project-context

## MODIFIED Requirements

### Requirement: Read-only project snapshot for tools
The system SHALL expose a single typed, read-only snapshot of a project — its context entries,
its conversation, its active estimate roll-up, and the **id of that active estimate** (or null
when there is none) — for a tool to consume. The snapshot SHALL expose no write path; the only
value a tool can send back SHALL be a `Suggestion`. A tool MAY use the active estimate id to
target an `estimate_line_item` suggestion at that estimate.

#### Scenario: Snapshot carries context, conversation, and estimate
- **WHEN** a snapshot is built for a project with entries, messages, and an active estimate
- **THEN** it contains those entries, that conversation, and the active estimate's engine
  roll-up, and nothing on it can mutate the project

#### Scenario: A tool can only return a suggestion
- **WHEN** a tool acts on a snapshot
- **THEN** the only change it can produce is a `pending` suggestion in the queue, never a
  direct write to context or the estimate

#### Scenario: Snapshot exposes the active estimate id
- **WHEN** a project has an active estimate
- **THEN** the snapshot carries that estimate's id so a tool can target a line-item suggestion at
  it, and carries null when the project has no active estimate
