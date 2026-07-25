# client-estimate-doc Specification

## Purpose
Turning a finished internal estimate into the client-facing proposal — the last v1 tool, and the
step that closes the product loop (build the estimate, see if it pulls its weight, send the client
a proposal that shows only the price). It owns the deterministic estimate → client-document
projection: the engine's single solved total allocated across the lines proportional to cost, exact
to the cent, with **no cost, margin, EPH, or crew-hour figure** crossing over (they have no field on
the document). The tool wraps that with an optional AI scope narrative and returns the document as
its typed output; the document itself — storage, the revocable share link, the public render — is
`client-document` (10a).
## Requirements
### Requirement: The tool generates a client-safe document from an estimate
The system SHALL provide a Client Estimate Doc tool that turns a finished estimate into a
client-facing document — the business, the client, a scope, priced line items, and a total — and
returns it as the tool's typed output (a document, not a suggestion). The tool SHALL receive the
estimate material as validated input and SHALL hold no database or storage handle. The internal
estimate SHALL be unchanged; the document is a separate artifact.

#### Scenario: An estimate becomes a client document
- **WHEN** the tool runs for a project's active estimate
- **THEN** it returns a client-safe document with the business, client, priced lines, and total,
  and creates no change to the estimate

#### Scenario: The tool has no write path
- **WHEN** the tool runs
- **THEN** it receives the estimate material as input and has no method to read another estimate or
  write to the estimate or context

### Requirement: Client prices are allocated from the solved total and add up
The document's line prices SHALL be derived by allocating the estimate's single solved (or
total-overridden) price across the lines **proportional to each line's cost**, rounded to whole
cents so the line prices **sum exactly to the subtotal**, and the total SHALL equal the subtotal
plus any tax. A line with zero cost SHALL be omitted from the document (it would carry no price).
No cost, labor-minute, or quantity figure SHALL appear on a line — a client line is a description
and a price. Tax, when the business has a tax rate, SHALL be computed from that rate; otherwise
there is no tax line.

#### Scenario: Allocation is exact to the cent
- **WHEN** the solved total is allocated across several lines whose proportional shares don't land
  on whole cents
- **THEN** the rounded line prices still sum exactly to the subtotal, and the total equals subtotal
  plus tax

#### Scenario: A zero-cost line is dropped
- **WHEN** an estimate has a line that contributes no cost
- **THEN** that line does not appear on the client document, and the remaining lines still sum to
  the total

#### Scenario: A client line shows no internal figure
- **WHEN** a labor or material line is projected onto the document
- **THEN** it carries a description and a price only — never its cost, labor minutes, or quantity

### Requirement: The projection refuses rather than contradict the estimate
The projection SHALL refuse to generate — reporting a clear reason rather than producing a broken
or misleading document — when the estimate cannot be priced (the margin can't be solved, or the
business has no billable capacity set), when it has **no total cost to allocate**, or when any line
carries an **explicit per-line price override** (which proportional allocation would contradict). A
total-price override SHALL NOT trigger a refusal; it is simply the total that is allocated.

#### Scenario: An unpriceable estimate is refused
- **WHEN** the estimate cannot be priced, or has no cost to allocate
- **THEN** the tool reports that the document can't be generated yet, rather than producing a
  broken or zero-priced document

#### Scenario: A per-line override is refused
- **WHEN** any line carries an explicit per-line price override
- **THEN** the tool refuses and reports that line pricing must be resolved first, rather than
  showing the client a price that contradicts the line's set price

#### Scenario: A total-price override still generates
- **WHEN** the estimate's total price is overridden (but no line is)
- **THEN** the document generates, allocating that overridden total across the lines

### Requirement: The optional scope narrative never states internal figures, and is reviewed
When AI is configured, the tool MAY write a scope narrative for the document; when it is not, the
document SHALL generate deterministically with no narrative. The narrative SHALL be instructed
never to state a cost, margin, profit, or crew-hour figure. Because prose cannot be structurally
constrained, a generated document SHALL be created **unshared**, and the owner SHALL be able to
review — and edit or remove — the narrative before it is shared.

#### Scenario: No narrative without AI
- **WHEN** the tool runs with no configured model
- **THEN** the document is generated with its priced lines and total and no scope narrative, and
  nothing fails

#### Scenario: A generated document starts unshared and reviewable
- **WHEN** a document is generated
- **THEN** it is created unshared, and the owner can preview it and edit or remove the narrative
  before choosing to share it

### Requirement: The owner can generate, share, copy, and revoke from the project
The system SHALL let the owner generate a client document from a project's estimate, see the
project's documents, share one to get its public link, copy that link, and revoke it — all
server-side and tenant-scoped, never trusting a client-supplied business id.

#### Scenario: Generate then share
- **WHEN** the owner generates a document and then shares it
- **THEN** an unshared draft is created, and sharing returns the public `/share/<token>` link to
  copy

#### Scenario: Revoke stops the link
- **WHEN** the owner revokes a shared document
- **THEN** its public link no longer resolves

#### Scenario: Generating is tenant-scoped
- **WHEN** a document is generated or shared
- **THEN** the business is resolved from the session server-side and no client-supplied business id
  is trusted

### Requirement: Nothing Client Estimate Doc produces changes an estimate or context
Generating a document SHALL create only a document; it SHALL NOT modify the estimate, add a
context entry, or create a suggestion, and the run SHALL be recorded as a `tool_run`.

#### Scenario: Only a document is produced
- **WHEN** the tool generates a document
- **THEN** no estimate, context entry, or suggestion changes, and a `tool_run` records the
  generation

