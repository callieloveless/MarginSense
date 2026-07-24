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
are now and as they would be if the line were added. When a proposed line's **cost is not yet
known** — a material a tool identified but could not price — the preview SHALL NOT show a profit
delta computed as though the line were free; it SHALL show the line's labor-hour impact together
with a plain note that the cost is not yet known.

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

#### Scenario: An unpriced line shows its hours, not a free-line profit delta
- **WHEN** a pending `estimate_line_item` suggestion carries no cost (an identified but unpriced
  material)
- **THEN** it is shown with a plain "not yet priced" note and any labor-hour impact, and NOT with
  a profit-per-hour delta that treats the missing cost as zero

#### Scenario: Presentation does not depend on the tool
- **WHEN** two different tools each produce a suggestion with the same target and payload
- **THEN** the two suggestions are presented identically, driven by target and payload, with no
  branch on which tool produced them
