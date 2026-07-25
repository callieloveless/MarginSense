## ADDED Requirements

### Requirement: Bottom-tab navigation with active state
The authenticated shell SHALL present a bottom tab bar with exactly three tabs — **Dashboard**,
**Jobs**, **Settings** — on the three top-level sections, where the tab matching the current
section is marked with `aria-current="page"`. Each tab SHALL be at least a 44px tap target.
Job-level pages (a job's hub, estimate, tools, documents, context) are reached by drilling into
a job, NOT by a tab; on them the tab bar SHALL be hidden and a back affordance to the parent
SHALL be presented instead (matching the prototype's drill-in model).

#### Scenario: Current section is marked
- **WHEN** the user is on the Dashboard section
- **THEN** the Dashboard tab is marked `aria-current="page"` and the other tabs are not

#### Scenario: Jobs label, project entity unchanged
- **WHEN** the tab bar and the jobs list render
- **THEN** the user-visible label is "Jobs" (tab and list title) while the underlying route and
  domain entity remain `project` (a label change only, no behavior change)

#### Scenario: Job sub-page is drill-in, not a tab
- **WHEN** the user is on a job's hub/estimate/tools/documents page
- **THEN** the bottom tab bar is not shown and a back affordance to the job (or its parent) is present

### Requirement: Signal palette paired with text
The shell SHALL define the red / yellow / green signal colors as centralized design tokens, and
every rendered signal SHALL include a text label so the meaning is never conveyed by color alone.
A state with insufficient data SHALL render a neutral (non-threshold) token with explanatory text.

#### Scenario: A threshold signal carries a word
- **WHEN** a green (pulling its weight) signal is rendered
- **THEN** it shows the green token AND an accompanying text label, never color only

#### Scenario: Not-enough-info is neutral
- **WHEN** there is not enough data to compute a signal
- **THEN** a neutral token with explanatory text is shown, never a red/yellow/green threshold color

### Requirement: Shared phone-first primitives
The shell SHALL provide reusable, phone-first UI primitives — section header, card, signal chip
(extending the existing `SignalBadge`), stat row, stepped-progress indicator, and a bottom sheet —
usable by every outer-layer and tool screen. Interactive primitives SHALL be client components;
non-interactive primitives SHALL be renderable in a server component.

#### Scenario: Bottom sheet opens and dismisses
- **WHEN** a trigger opens a bottom sheet
- **THEN** the sheet appears over the current screen and dismisses on backdrop tap or an explicit close control

#### Scenario: Stepped progress reflects position
- **WHEN** a stepped flow at step N of M renders its progress indicator
- **THEN** N of M steps are shown as complete/current

### Requirement: Teaching empty states
Any list or surface with no data SHALL render a teaching empty state that names what the surface
is for and offers the primary next action, rather than a blank region.

#### Scenario: Empty list teaches
- **WHEN** a list-backed screen has zero items
- **THEN** an empty state explaining the screen's purpose and a primary action are shown

### Requirement: Presentation-only reorganization
Reorganizing existing routes into the shell SHALL NOT change any screen's data, financial
computations, tenant scoping, or tool behavior. All displayed numbers SHALL continue to come from
`src/engine/`, and all data access SHALL continue to run tenant-scoped through `src/db/` helpers;
the shell SHALL introduce no new data-access path and SHALL NOT trust a client-supplied
`business_id`.

#### Scenario: Same values after reorganization
- **WHEN** a screen is moved into the new shell
- **THEN** it renders the same engine-computed values it did before, with no change to its queries

#### Scenario: No new data path
- **WHEN** the shell renders any screen
- **THEN** it adds no query or mutation of its own and reads no tenant data outside the existing
  tenant-scoped helpers

### Requirement: Responsive phone-first column, not a device frame
The shell SHALL render as a responsive single column constrained to a phone-width maximum that
works at phone and desktop widths, and SHALL NOT emulate a fixed device frame or bezel.

#### Scenario: Phone width
- **WHEN** the viewport is phone width
- **THEN** the shell fills the viewport as a single column

#### Scenario: Desktop width
- **WHEN** the viewport is desktop width
- **THEN** the shell is a centered max-width column, not a rendered phone mockup

### Requirement: Auth gating and unconfigured states preserved
The shell SHALL preserve the existing auth gating and environment-unconfigured states, presenting
them within the new frame. Signed-out users SHALL be routed to sign-in; signed-in users without a
business SHALL be routed to create-business; an unconfigured backend SHALL render its skeleton
state inside the shell.

#### Scenario: Gating unchanged
- **WHEN** a signed-out user requests an authenticated route
- **THEN** they are routed to sign-in exactly as before, now within the shell's frame

#### Scenario: Unconfigured backend
- **WHEN** Supabase is unconfigured
- **THEN** the existing skeleton/"connect" state renders inside the shell rather than a broken page
