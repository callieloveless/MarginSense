# code-finder Specification

## Purpose
Surfacing the **local** building code that applies to a job — a standalone question and the first
composed consumer (off Photo Advisor's code-relevant findings). It answers with a focused set of
**sourced** `code_ref` entries (never a citation it can't source, §7), and — because the product
answers "is this job worth the hours" — it frames each permit/inspection/licensed-trade
consequence as the job's added cost and crew hours, not a bare citation. It writes no line item
(an unpriced permit line would understate cost) and carries the licensed-professional,
non-authoritative disclaimer; a code lookup is never an official inspection.
## Requirements
### Requirement: Code Finder answers a local-code question with a focused, sourced result
The system SHALL provide a Code Finder tool that takes a code question and searches for the
relevant **local** building code, proposing the **most relevant** results — a small, focused set,
not an exhaustive citation list — as `code_ref` context-entry suggestions carrying the code, the
requirement it states, its jurisdiction, and the source it came from. It SHALL post a summary of
what it found to the project's single conversation. It SHALL NOT keep a separate per-tool
conversation history — one question, one answer, into the one job thread (constitution §4).

#### Scenario: A code question returns sourced code references
- **WHEN** the user runs Code Finder with a question
- **THEN** it searches local code and proposes the most relevant results as `pending` `code_ref`
  suggestions carrying the code, requirement, jurisdiction, and source, with a summary posted to
  the conversation

#### Scenario: The result set is focused, not exhaustive
- **WHEN** a search matches many loosely-relevant code sections
- **THEN** only the few most relevant are proposed, so the review queue is not flooded on a phone

#### Scenario: The answer lands in the one conversation
- **WHEN** Code Finder posts its result
- **THEN** it appears in the project's single conversation attributed to the tool, not in a
  private per-tool thread

### Requirement: Code Finder never proposes a code it cannot source
A code reference with no source SHALL NOT be proposed (constitution §7 — the app never fabricates
a citation it cannot source), and no Code Finder output SHALL be presented as an authoritative or
official determination of compliance.

#### Scenario: An unsourced code is dropped
- **WHEN** a candidate code reference has no source URL
- **THEN** it is not turned into a suggestion, so no unsourced or fabricated citation reaches the
  job

#### Scenario: Results are non-authoritative
- **WHEN** Code Finder returns any result
- **THEN** it carries the licensed-professional, non-authoritative disclaimer and is not presented
  as an official inspection or a compliance certification

### Requirement: Code Finder localizes to the business service area
Code Finder SHALL bias its search to the business's service area when set, pre-filled from
`business_settings.service_area` and overridable per query, and SHALL fall back to a non-local
search when none is set.

#### Scenario: Search is localized
- **WHEN** the business has a service area set and the user does not override the location
- **THEN** the search is biased toward that jurisdiction's code

#### Scenario: No service area set
- **WHEN** no service area is set and none is entered
- **THEN** the search still runs without a local bias, and the result says the jurisdiction was
  not narrowed

### Requirement: Code Finder surfaces compliance consequences as the job's cost and hours
Each code reference MAY carry a plain-language compliance note — a permit, an inspection, a
licensed-trade requirement — and Code Finder's conversation post SHALL surface those notes as
**what they cost the job**: added crew hours and dollars the estimate may not include, and the risk
that the job is less profitable than it looks. Code Finder SHALL NOT propose a permit or inspection
as an estimate line item (an unpriced line would understate the job's cost); it states the
consequence and leaves the costing to the user or to Material Finder.

#### Scenario: A permit implication is stated as a cost/time consequence
- **WHEN** a proposed code implies a permit, inspection, or licensed trade
- **THEN** the `code_ref` carries that compliance note, and the conversation post states its likely
  cost and crew-hour impact on the job in plain language — not merely that a code exists

#### Scenario: No fabricated permit line
- **WHEN** a compliance requirement implies added work
- **THEN** no `estimate_line_item` is proposed for it, so no unpriced (zero-cost) line can enter
  the estimate and overstate its profit

### Requirement: Code-relevant Photo Advisor findings compose into Code Finder runs
When Photo Advisor produces findings, the system SHALL run Code Finder through the composition seam
for **each finding that carries a code implication** — a `safety` or `attention` severity — with
the finding shaping the query and the jurisdiction resolved from the service area, so the codes for
a diagnosed defect are looked up without the user re-entering them. A cosmetic (`note`) finding
SHALL NOT trigger a composed run. Each composed run SHALL be dispatched as a composed run (bounded
by the step budget) and SHALL produce only `pending` suggestions; nothing SHALL be committed
without the user accepting it.

#### Scenario: A code-relevant finding triggers a code lookup
- **WHEN** Photo Advisor returns a `safety` or `attention` finding for a project
- **THEN** a Code Finder run is composed for it, proposing `pending` `code_ref` suggestions, and
  none is committed until the user accepts

#### Scenario: A cosmetic finding does not
- **WHEN** Photo Advisor returns a `note`-severity finding
- **THEN** no Code Finder run is composed for it, so the auto-path spends nothing on a cosmetic
  observation

#### Scenario: A composed code reference is traceable to its photo
- **WHEN** Code Finder runs composed from a Photo Advisor finding
- **THEN** each `code_ref` it proposes records the photo the finding came from

#### Scenario: A composition failure never breaks the diagnosis
- **WHEN** a composed Code Finder run fails or is refused by the step budget
- **THEN** Photo Advisor's own findings and post are unaffected, and the failure does not surface
  as a failure of the photo run

### Requirement: Code Finder requires a configured model and degrades plainly without one
The standalone Code Finder query SHALL require the model to run. When AI is unconfigured, its
surface SHALL render a plain "connect AI" state and the query SHALL be unavailable, rather than
failing when invoked.

#### Scenario: AI unconfigured
- **WHEN** no model is configured and the user opens Code Finder
- **THEN** the surface explains that AI isn't connected, running is unavailable, and nothing throws

### Requirement: Nothing Code Finder produces is committed until the user accepts
Everything Code Finder proposes — from a standalone query or a composed run — SHALL be a `pending`
suggestion; no context change SHALL occur until the user accepts it, and each run SHALL be recorded
as a `tool_run` linked to what it produced.

#### Scenario: Proposals stay pending
- **WHEN** Code Finder proposes code references
- **THEN** they are `pending`, nothing in the context changes until the user accepts, and a
  `tool_run` records the run and is referenced by the suggestions and the post

