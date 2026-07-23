# project-context

## MODIFIED Requirements

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

## ADDED Requirements

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
