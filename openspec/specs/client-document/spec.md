# client-document Specification

## Purpose
Holding and sharing the one artifact a **client** sees — the polished proposal — kept strictly
apart from the internal estimate. This capability owns the rules that make that safe: a document
stores a **client-safe payload** with no field for cost, overhead, margin, EPH, the signal, or
labor minutes (an internal number is unrepresentable on it), frozen at creation so a later edit
can't change what was sent, and arithmetically consistent by construction. It is shared through a
revocable, unguessable token read by a single `SECURITY DEFINER` function — the one deliberate
public capability (constitution §5, §7) — with every authenticated path still tenant-isolated. The
tool that *generates* a document from an estimate (and writes its scope prose) is
`client-estimate-doc`.
## Requirements
### Requirement: A document stores only client-safe fields
A client document SHALL store a payload that contains only fields a client may see — business
identity, the client, a title and date, an optional scope narrative, line items with their client
**price** only, subtotal, optional tax, total, and terms. The payload SHALL have no field for cost,
overhead, contingency, margin, Effective Profit per Hour, the red/yellow/green signal, or labor
minutes, so internal figures are not merely hidden but absent by construction. A payload carrying
any such field SHALL be rejected at the validation boundary.

#### Scenario: A client-safe payload is stored
- **WHEN** a document is created from a payload of business identity, client, priced line items,
  totals, and terms
- **THEN** it persists as a document on that project with exactly those fields

#### Scenario: An internal field is rejected
- **WHEN** a payload is submitted that includes a cost, margin, EPH, signal, or labor-minutes field
- **THEN** the write is rejected at the validation boundary and no document is created

#### Scenario: A document that does not add up is rejected
- **WHEN** a payload's subtotal is not the sum of its line prices, or its total is not the subtotal
  plus tax
- **THEN** the write is rejected at the validation boundary, so a client document is arithmetically
  consistent by construction

### Requirement: A document is a frozen snapshot
A document SHALL capture its client-facing content at creation and SHALL NOT change when the
estimate it was generated from is later edited, so what a client was shown is always knowable. A
revised proposal SHALL be a new document, not an edit of an existing one.

#### Scenario: Editing the estimate does not change a document
- **WHEN** an estimate is edited after a document was generated from it
- **THEN** the existing document's content is unchanged

### Requirement: A document is shared through a revocable, unguessable link
Sharing a document SHALL mint a high-entropy share token and mark the document shared; the client
SHALL be able to open it at a public URL keyed by that token **without logging in**. Revoking SHALL
mark the document revoked so the link no longer resolves. The public read SHALL return a document's
payload only when the token matches a document that is shared and not revoked, and SHALL return
nothing for a wrong, unshared, or revoked token.

#### Scenario: A shared link resolves for the client
- **WHEN** a document is shared and the client opens its token URL
- **THEN** the client-safe payload is returned and rendered, with no login required

#### Scenario: A revoked link stops resolving
- **WHEN** a shared document is revoked and its token URL is opened
- **THEN** the payload is not returned and the page shows the document is no longer available

#### Scenario: Re-sharing a revoked document does not revive the old link
- **WHEN** a revoked document is shared again
- **THEN** it is issued a new token, and the previously revoked token never resolves again

#### Scenario: A wrong or unshared token returns nothing
- **WHEN** a token URL is opened for a token that matches no document, or a document that has not
  been shared
- **THEN** nothing is returned and no document content is exposed

### Requirement: The public read cannot reach internal or cross-tenant data
The public token read SHALL expose only the requested document's client-safe payload — never any
other row, table, or business — and SHALL be the only path that returns document data without an
authenticated, tenant-scoped session. Every authenticated path to documents SHALL remain
tenant-isolated by Row-Level Security.

#### Scenario: The token read exposes only the one payload
- **WHEN** the public read runs for a valid token
- **THEN** it returns that document's client-safe payload and nothing else — no other document, no
  estimate, no business or project row

#### Scenario: Cross-tenant document access is blocked
- **WHEN** a user from business A requests, shares, or revokes business B's document
- **THEN** Row-Level Security returns no rows and nothing in business B changes

### Requirement: The shared document renders client-first and print-friendly
The shared document page SHALL be a phone- and print-friendly, read-only rendering of the payload —
suitable to print to PDF from the browser or send as a link — showing the business, the client, the
scope, the priced line items, and the total, and nothing internal.

#### Scenario: The client page shows only the proposal
- **WHEN** the shared page renders
- **THEN** it shows the business, client, scope, priced lines, and total, and shows no cost,
  overhead, margin, EPH, signal, or labor-minute figure

#### Scenario: It is read-only
- **WHEN** the client views the shared page
- **THEN** there is no control to accept, sign, pay, or edit — the page only presents the proposal

### Requirement: Documents are tenant-isolated for their owner
Every `documents` row SHALL carry a non-null `business_id` with Row-Level Security enforced, and
the create/list/share/revoke paths SHALL be server-side and tenant-scoped, so one business can
never read or change another's documents.

#### Scenario: The business_id is stamped from the session
- **WHEN** a document is created
- **THEN** its `business_id` comes from the tenant handle, never from input

#### Scenario: Listing is business-scoped
- **WHEN** a user lists a project's documents
- **THEN** only that business's documents are returned

