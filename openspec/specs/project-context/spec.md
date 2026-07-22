# project-context Specification

## Purpose
TBD - created by archiving change add-project-context. Update Purpose after archive.
## Requirements
### Requirement: Typed context entries per project
Each project SHALL have a shared context holding typed, structured entries — `finding`,
`material`, `code_ref`, `photo`, and `fact` (constitution §4.1) — where every entry carries a
non-null `business_id`, its project, a typed payload for its kind, and an author (the user or,
later, a named tool). Entries SHALL be read and added only through tenant-scoped helpers.

#### Scenario: Add a material entry
- **WHEN** a material is recorded for a project with a name, price, unit, supplier, and source
  URL
- **THEN** it persists as a `material` context entry on that project with its typed payload
  and its author

#### Scenario: Entry kinds are constrained
- **WHEN** a context entry is written with a kind outside `finding | material | code_ref |
  photo | fact`
- **THEN** the write is rejected at the validation boundary

### Requirement: One conversation per project
Each project SHALL have exactly one conversation thread that all tools and the user read from
and post into; a message SHALL be attributed to its author (`user` or a tool name). The system
SHALL NOT keep separate per-tool conversation histories.

#### Scenario: All posts land in one thread
- **WHEN** the user and two different tools each post to a project
- **THEN** every message appears in that project's single conversation, each attributed to its
  author, in order

#### Scenario: No per-tool histories
- **WHEN** a tool reads the conversation
- **THEN** it sees the one shared project thread, not a private per-tool history

### Requirement: Suggestions queue with accept and dismiss
The system SHALL hold proposed changes as `suggestions` with status `pending`, `accepted`, or
`dismissed`. A suggestion SHALL name its target (a context entry to commit, or an estimate line
item to add) and its payload. Accepting a suggestion SHALL be the ONLY path that commits the
proposed context entry or estimate change; a dismissed suggestion SHALL be remembered so the
same proposal does not reappear. No suggestion SHALL be applied automatically.

#### Scenario: Accept commits the change
- **WHEN** a user accepts a pending suggestion that proposes a material line item
- **THEN** the line item is added to the target estimate and the suggestion becomes `accepted`

#### Scenario: Dismiss is remembered
- **WHEN** a user dismisses a pending suggestion
- **THEN** the suggestion becomes `dismissed`, nothing is committed, and it is not surfaced
  again as pending

#### Scenario: Nothing auto-applies
- **WHEN** a suggestion is created
- **THEN** it is `pending` and no context entry or estimate changes until the user accepts it

### Requirement: Read-only project snapshot for tools
The system SHALL expose a single typed, read-only snapshot of a project — its context entries,
its conversation, and its active estimate roll-up — for a tool to consume. The snapshot SHALL
expose no write path; the only value a tool can send back SHALL be a `Suggestion`.

#### Scenario: Snapshot carries context, conversation, and estimate
- **WHEN** a snapshot is built for a project with entries, messages, and an active estimate
- **THEN** it contains those entries, that conversation, and the active estimate's engine
  roll-up, and nothing on it can mutate the project

#### Scenario: A tool can only return a suggestion
- **WHEN** a tool acts on a snapshot
- **THEN** the only change it can produce is a `pending` suggestion in the queue, never a
  direct write to context or the estimate

### Requirement: Creating an estimate seeds the project context
Creating an estimate SHALL seed the project's shared context with the job's cost/hour data as
a `fact` entry, establishing the one-way default flow from estimate into context (constitution
§4).

#### Scenario: First estimate seeds a fact
- **WHEN** the first estimate for a project is created
- **THEN** a `fact` context entry recording the job's cost/hour data is added to that
  project's context

### Requirement: Project context is tenant-isolated
Every `context_entries`, `conversation_messages`, and `suggestions` row SHALL carry a non-null
`business_id` with Row-Level Security enforced, and the accept path SHALL be server-side and
tenant-scoped, so one business can never read, write, or accept another's context, messages, or
suggestions.

#### Scenario: Cross-tenant read is blocked
- **WHEN** a user from business A requests business B's project context
- **THEN** Row-Level Security returns no rows and no cross-tenant data is exposed

#### Scenario: Cross-tenant accept is blocked
- **WHEN** a user from business A attempts to accept a suggestion belonging to business B
- **THEN** the accept is rejected and nothing in business B changes

