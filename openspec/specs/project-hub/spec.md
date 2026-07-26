# project-hub Specification

## Purpose
TBD - created by archiving change revamp-project-hub. Update Purpose after archive.
## Requirements
### Requirement: The job hub is the job's default surface
Opening a job SHALL land on a hub that presents, on one screen, the job's identity, its profit
signal, the pending-suggestion queue, a compact activity feed, a grid of the tools that exist, and
the estimate versions. The hub SHALL read only through the tenant-scoped handle resolved from the
session; it SHALL never accept a business or project owner from the client, and a job belonging to
another business SHALL resolve to not-found.

#### Scenario: Opening a job lands on the hub
- **WHEN** a user opens one of their jobs
- **THEN** the job's hub is shown with the profit hero, the "Waiting on you" queue, the activity
  feed, the tools grid, and the estimate versions on one screen

#### Scenario: Another business's job is not reachable
- **WHEN** a user requests a job id that belongs to another business
- **THEN** the hub resolves to not-found and no cross-tenant data is shown

### Requirement: The hub shows the job's identity
The hub SHALL show the job's client name and a plain sub-line built only from the setup fields that
are set — among address, job type, crew size, and start window. A field that is unset SHALL be
omitted; the hub SHALL never show a placeholder or fabricated value for a missing field.

#### Scenario: Sub-line reflects only set fields
- **WHEN** a job has an address and job type but no crew size or start window
- **THEN** the sub-line shows the address and job type and omits crew and start window, with no
  placeholder text

### Requirement: The hub shows the profit-per-hour hero
The hub SHALL show the active estimate's Effective-Profit-per-Hour and its red/yellow/green signal,
color always paired with text (the persistent signal of `project-context`). When the job has no
active estimate the hub SHALL show a plain "no active estimate yet — build one" state that leads to
creating an estimate, never a broken or fabricated number.

#### Scenario: Signal shown for a priced job
- **WHEN** the job has an active estimate that can be priced
- **THEN** the hero shows its EPH and red/yellow/green signal with text

#### Scenario: No active estimate degrades gracefully
- **WHEN** the job has no active estimate
- **THEN** the hero shows a plain "no active estimate yet — build one" state that leads to the
  estimate-creation action, and shows no number

### Requirement: The hub triages pending suggestions
The hub SHALL present the project's pending suggestions as a "Waiting on you" queue, each shown from
its target and payload alone (never the identity of the tool that produced it), with accept and
dismiss acting in place. A pending `estimate_line_item` suggestion SHALL show its before→after
profit impact — the estimate's EPH and signal as they are now and as they would be if the line were
added — and that previewed EPH SHALL equal the EPH the estimate has after the suggestion is
accepted. Accepting or dismissing on the hub SHALL act on the one shared durable queue, so the item
also leaves any other surface that shows it.

#### Scenario: A pending line-item suggestion previews its impact on the hub
- **WHEN** the hub shows a pending `estimate_line_item` suggestion for a job with an active estimate
- **THEN** it shows the current EPH and signal and the EPH and signal the estimate would have with
  the proposed line added, and that previewed EPH equals the estimate's EPH after accept

#### Scenario: Accept on the hub commits once and clears the queue
- **WHEN** a user accepts a pending suggestion from the hub
- **THEN** the proposed change is committed exactly once, the suggestion becomes accepted, and it no
  longer appears as pending on the hub or on the job-memory surface

#### Scenario: Nothing waiting is calm
- **WHEN** the job has no pending suggestions
- **THEN** the hub shows a plain "nothing waiting" state, not an empty control that looks broken

### Requirement: The hub links to the tools that exist, with honest badges
The hub SHALL present a grid of tiles that open the job surfaces that exist today, and SHALL NOT
show a tile that links to a tool that is not built. A tile SHALL show a live badge ONLY where a real
count or status backs it; a tile with no real count SHALL show no badge, and no badge SHALL be
fabricated.

#### Scenario: A tile badges only a real count
- **WHEN** a job has job photos and photo storage is connected
- **THEN** the Job-memory tile shows the real photo count as its badge

#### Scenario: No count means no badge
- **WHEN** a tile has no real count or status to show
- **THEN** the tile shows no badge and still opens its surface

#### Scenario: No tile for an unbuilt tool
- **WHEN** the hub renders its tools grid
- **THEN** every tile opens a surface that exists, and no tile links to a tool that is not built

### Requirement: The hub shows a compact activity feed
The hub SHALL show a compact, most-recent-first slice of the job's context entries and conversation
as plain one-line rows, with a link through to the full job memory. The feed SHALL be read-only on
the hub. When the job has no activity the hub SHALL show a plain "no activity yet" state.

#### Scenario: Recent activity is summarized with a way to see all
- **WHEN** a job has context entries and conversation messages
- **THEN** the hub shows a recent slice of them as plain rows and a link to the full job memory

#### Scenario: No activity is calm
- **WHEN** a job has no context entries and no messages
- **THEN** the hub shows a plain "no activity yet" state

### Requirement: The hub keeps the estimate versions
The hub SHALL show the job's estimate versions and the action to create a new version, so the hub is
a complete replacement for the prior job page and nothing it did is lost.

#### Scenario: Versions and create remain on the hub
- **WHEN** a user views the hub
- **THEN** the estimate versions are listed and a create-new-version action is available, and the
  active version is marked

