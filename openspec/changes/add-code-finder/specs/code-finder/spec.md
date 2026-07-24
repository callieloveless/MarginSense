## ADDED Requirements

### Requirement: Code Finder answers a local-code question and pins the result to the job
The system SHALL provide a Code Finder tool that takes a code question and searches for the
relevant **local** building code, proposing each result as a `code_ref` context-entry suggestion
carrying the code, the requirement it states, its jurisdiction, and the source it came from. It
SHALL post a summary of what it found to the project's single conversation. It SHALL NOT keep a
separate per-tool conversation history — one question, one answer, into the one job thread
(constitution §4).

#### Scenario: A code question returns sourced code references
- **WHEN** the user runs Code Finder with a question
- **THEN** it searches local code and proposes each result as a `pending` `code_ref` suggestion
  carrying the code, requirement, jurisdiction, and source, with a summary posted to the
  conversation

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

### Requirement: Code Finder surfaces compliance consequences, not just citations
Each code reference MAY carry a plain-language compliance note — a permit, an inspection, a
licensed-trade requirement — and Code Finder's conversation post SHALL surface those notes for the
work they concern, so the code's consequence is legible and not left implicit in the citation.

#### Scenario: A permit implication is stated
- **WHEN** a proposed code implies a permit or inspection
- **THEN** the `code_ref` carries that compliance note and the conversation post states it in
  plain language

### Requirement: Photo Advisor findings compose into Code Finder runs
When Photo Advisor produces findings, the system SHALL run Code Finder for **each finding** through
the composition seam, with the finding shaping the query and the jurisdiction resolved from the
service area, so the codes for a diagnosed defect are looked up without the user re-entering it.
Each composed run SHALL be dispatched as a composed run (bounded by the step budget) and SHALL
produce only `pending` suggestions; nothing SHALL be committed without the user accepting it.

#### Scenario: Each finding triggers a code lookup
- **WHEN** Photo Advisor returns findings for a project
- **THEN** one Code Finder run is composed per finding, each proposing `pending` `code_ref`
  suggestions, and none is committed until the user accepts

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
