# project-context Specification

## Purpose
TBD - created by archiving change add-project-context. Update Purpose after archive.
## Requirements
### Requirement: Typed context entries per project
Each project SHALL have a shared context holding typed, structured entries — `finding`,
`material`, `code_ref`, `photo`, and `fact` (constitution §4.1) — where every entry carries a
non-null `business_id`, its project, a typed payload for its kind, and an author (the user or,
later, a named tool). Entries SHALL be read and added only through tenant-scoped helpers.

A `finding` SHALL additionally carry a **severity** — `safety`, `attention`, or `note` — so the
job's memory records how serious a diagnosis is without a reader having to interpret its prose,
and it MAY name the photo it was derived from. Wherever a severity is displayed it SHALL be
paired with text and never conveyed by colour alone (constitution §6, phone-first accessibility).

A `code_ref` SHALL carry its code and the requirement it states, and MAY additionally carry the
**source** it was found at, a plain-language **compliance note** (a permit, an inspection, a
licensed-trade requirement), and the **photo** it was derived from when a diagnosis produced it —
all optional and additive, so a pinned code shows where it came from, what it implies, and (when
composed from a photo) the picture behind it.

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

#### Scenario: A code reference records its source and consequence
- **WHEN** a `code_ref` entry is recorded from a code search
- **THEN** it may carry the source URL it was found at and a plain-language compliance note, and a
  `code_ref` without them is still valid

#### Scenario: A composed code reference names its photo
- **WHEN** a `code_ref` is proposed by a run composed from a photo finding
- **THEN** it may carry the photo's reference, and one without it is still valid

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
same proposal does not reappear. No suggestion SHALL be applied automatically. A suggestion
SHALL be presented from its target and payload alone — never from the identity of the tool that
produced it — so that a pending `estimate_line_item` suggestion SHALL show the profit impact of
accepting it: the estimate's Effective-Profit-per-Hour and its red/yellow/green signal as they
are now and as they would be if the line were added.

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

#### Scenario: A line-item suggestion previews its profit impact
- **WHEN** a pending `estimate_line_item` suggestion is shown for a project with an active
  estimate
- **THEN** it shows the current EPH and signal and the EPH and signal the estimate would have
  with the proposed line added, and that previewed EPH equals the EPH the estimate has after the
  suggestion is accepted

#### Scenario: The preview degrades gracefully with no active estimate
- **WHEN** a line-item suggestion is shown for a project with no active estimate (or no billable
  capacity set)
- **THEN** the proposed change is shown without a profit delta and with a plain note, never a
  broken or fabricated number

#### Scenario: Presentation does not depend on the tool
- **WHEN** two different tools each produce a suggestion with the same target and payload
- **THEN** the two suggestions are presented identically, driven by target and payload, with no
  branch on which tool produced them

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

### Requirement: A tool's result surfaces where it was run
When a user runs a tool, the suggestions and conversation post it produces SHALL be shown on the
same surface the run was started from, with an in-progress indication while the run is still
running, so the user can see and act on the result without navigating to another screen. The
durable queue and conversation remain the project's shared record.

#### Scenario: Result appears in place
- **WHEN** a user runs a tool from the project's Tools surface
- **THEN** the resulting suggestion card(s) and conversation post appear on that surface, with a
  running indication while the run is in flight, and accept/dismiss act in place

### Requirement: The job surface keeps the profit signal in view
While a user works within a project — running tools and reviewing suggestions — the active
estimate's profit signal (EPH and its red/yellow/green color, paired with text) SHALL remain
visible, and SHALL be absent-safe when there is no active estimate.

#### Scenario: Signal stays visible across the job surface
- **WHEN** a user views the project's context or Tools surface and the project has an active
  estimate
- **THEN** the estimate's EPH and red/yellow/green signal are shown persistently, with color
  always paired with text

#### Scenario: No active estimate is handled gracefully
- **WHEN** the project has no active estimate
- **THEN** the surface shows a plain "no active estimate yet" state instead of a signal, never a
  broken number

