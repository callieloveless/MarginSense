# material-finder

## ADDED Requirements

### Requirement: Material Finder searches by query or across the estimate
The system SHALL provide a Material Finder tool that finds materials either from a free-text
query (one material need) or across the whole active estimate (deriving the needs from its
scope and lines). In both modes it searches the web for current products, prices, and
suppliers and proposes the results into the job; it SHALL post a summary of what it found to
the single project conversation.

#### Scenario: Free-text query search
- **WHEN** the user runs Material Finder with a query
- **THEN** it searches for materials matching that query and proposes the results, and posts a
  summary to the conversation

#### Scenario: Whole-estimate search
- **WHEN** the user runs Material Finder in "find everything for this estimate" mode on a
  project with an active estimate
- **THEN** it derives the material needs from the estimate and proposes results for each, and
  posts a summary to the conversation

### Requirement: Material Finder returns comparable, sourced options
For a material need, Material Finder SHALL return more than one option where available (a few
comparable products across suppliers/prices), each proposed as its own suggestion so the user
can pick the best value. Each option SHALL carry the source its price came from; an option with
no source SHALL NOT be proposed (§7 — never a price it cannot source). When the project has an
active estimate, each option SHALL be proposed as an `estimate_line_item` suggestion targeting
it (so its profit-per-hour impact previews); otherwise each SHALL be a `material` context-entry
suggestion.

#### Scenario: A search proposes comparable options
- **WHEN** Material Finder finds several products for a need
- **THEN** each is proposed as its own `pending` suggestion carrying its price, unit, supplier,
  and source, so the user can compare and accept one

#### Scenario: Options are line items when there is an active estimate
- **WHEN** Material Finder proposes options and the project has an active estimate
- **THEN** each option is an `estimate_line_item` suggestion targeting that estimate, and its
  profit-per-hour impact previews before acceptance

#### Scenario: Options are context entries when there is no active estimate
- **WHEN** Material Finder proposes options and the project has no active estimate
- **THEN** each option is a `material` context-entry suggestion, and no line-item suggestion

#### Scenario: An unsourced price is never proposed
- **WHEN** a candidate option has no source for its price
- **THEN** it is not turned into a suggestion, so no fabricated or unsourced price reaches the job

### Requirement: Material Finder localizes to the business service area
Material Finder SHALL use the business's service area, when set, to bias its search toward local
suppliers and prices; the search location SHALL be pre-filled from the service area and MAY be
overridden per search, and SHALL fall back to a non-local search when no service area is set.

#### Scenario: Search is localized to the service area
- **WHEN** the business has a service area set and the user runs a search without overriding the
  location
- **THEN** the search is biased toward suppliers and prices in that area

#### Scenario: No service area set
- **WHEN** the business has no service area set
- **THEN** the search still runs, without a location bias

### Requirement: A material can be added by hand
The system SHALL let the user add a material by hand — a name, price, unit, and optional
supplier — which is proposed as a `pending` suggestion (a `material` context entry and, when
there is an active estimate, an `estimate_line_item`) the same way a searched material is, so
the tool is usable before live AI is configured and when a price cannot be found. A hand-added
material SHALL NOT require the model.

#### Scenario: Hand-add a material with no AI
- **WHEN** the user hand-adds a material with a name, price, and unit
- **THEN** it is proposed as a `pending` suggestion (with a line item when there is an active
  estimate) without any model call, and nothing is committed until the user accepts it

### Requirement: Nothing is committed until the user accepts
Everything Material Finder proposes — searched or hand-added, material entry or line item —
SHALL be a `pending` suggestion; nothing SHALL change in the estimate or context until the user
accepts it.

#### Scenario: Proposals stay pending
- **WHEN** Material Finder proposes materials or line items
- **THEN** they are `pending` and no estimate or context change occurs until the user accepts
