# material-finder

## ADDED Requirements

### Requirement: Material Finder searches and proposes sourced materials
The system SHALL provide a Material Finder tool that takes a material query, searches the web
for matching materials with current prices and suppliers, and proposes them into the job — as
`material` context entries and, when the project has an active estimate, as `estimate_line_item`
suggestions — and posts a summary of its finds to the single project conversation. Every
proposed price SHALL carry the source it came from; a material without a source SHALL NOT be
proposed (§7).

#### Scenario: A search proposes sourced materials
- **WHEN** Material Finder is run with a query for a project
- **THEN** each found material becomes a `pending` `material` context-entry suggestion carrying
  its name, price, unit, supplier, and source URL, and a summary listing the finds with their
  sources is posted to the conversation

#### Scenario: Materials become line items for the active estimate
- **WHEN** Material Finder finds materials and the project has an active estimate
- **THEN** each material is also proposed as a `pending` `estimate_line_item` suggestion
  targeting the active estimate, so its profit-per-hour impact previews before acceptance

#### Scenario: No active estimate to add lines to
- **WHEN** Material Finder finds materials and the project has no active estimate
- **THEN** it proposes the `material` context entries only, and no line-item suggestion

#### Scenario: An unsourced price is never proposed
- **WHEN** a candidate material has no source for its price
- **THEN** it is not turned into a suggestion, so no fabricated or unsourced price reaches the
  job

#### Scenario: Nothing is committed until the user accepts
- **WHEN** Material Finder proposes materials and line items
- **THEN** they are `pending` suggestions and nothing changes in the estimate or context until
  the user accepts them
