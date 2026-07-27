# estimates

## MODIFIED Requirements

### Requirement: Estimate and line-item editing
The system SHALL let a user create and edit estimates and their line items. Line items SHALL keep
granular categories (labor, material, subcontractor, equipment, permit, disposal, other); labor lines
carry `laborMinutes` and non-labor lines carry `quantity` and `unitCost`. Grouping of categories is a
display concern only. The editor SHALL let a user enter an **optional price on any line** (blank means
the engine derives that line's baseline; a value fixes that line's price — the per-line pricing of
"Costs entered, price solved to target margin"). A user SHALL be able to **add, edit, delete, and
duplicate** a line, and to **reorder** lines, with the chosen order **persisted** (`sort_order`) and
used on reload. Only inputs are stored — entered costs and an entered per-line price; no derived price
is written.

#### Scenario: Add a labor and a material line
- **WHEN** the user adds a 480-minute labor line and a material line of quantity 4 at $12.50
- **THEN** both persist with their granular categories and integer units (minutes, cents)

#### Scenario: Enter a per-line price from the editor
- **WHEN** the user types a price on one line and leaves another line's price blank
- **THEN** the entered price persists as that line's `priceCents`, the blank line stores no price
  (its baseline is derived), and the estimate's price source becomes "set on lines"

#### Scenario: Reordering persists
- **WHEN** the user moves a line up and saves
- **THEN** the new order is stored and the estimate reloads with the lines in that order

#### Scenario: Duplicate a line
- **WHEN** the user duplicates a line
- **THEN** a new line with the same category, description, cost inputs, and any entered price is added
  directly below it

## ADDED Requirements

### Requirement: The editor shows each line's economics, with a per-line signal only where it is real
For each line the editor SHALL show, from the engine's per-line breakdown (never re-derived in the
UI), its effective **price** (entered or derived baseline), its **cost**, its **net**, and its **labor
hours**. A per-line **markup** MAY be shown as a percentage of cost. A per-line **profit-per-hour
red/yellow/green signal** SHALL be shown ONLY on a labor line whose price the user has **entered** (so
its rate reflects a real per-line decision), with colour always paired with text and the target it is
measured against. A labor line whose price is **derived** (baseline-allocated) SHALL show its numbers
**without a per-line colour signal**, with a plain note that it shares the estimate's blended labor
rate until it is priced — because cost-proportional allocation makes every baseline labor line's
profit-per-hour identical by construction, so a per-line colour there would be uninformative and
misleading. Non-labor lines SHALL show no profit-per-hour signal (the signal measures labor, §3.4a).
The editor SHALL also show **category subtotals** as a display-only summary of the lines.

#### Scenario: An entered-price labor line shows its own profit-per-hour and signal
- **WHEN** the user has entered a price on a labor line
- **THEN** that line shows its price, cost, net, hours, and profit-per-hour with a red/yellow/green
  signal on the same thresholds as the estimate, paired with the target it is measured against

#### Scenario: A baseline labor line shows no per-line colour
- **WHEN** a labor line has no entered price (its price is the derived baseline)
- **THEN** the line shows its numbers without a per-line red/yellow/green signal and notes that it
  shares the estimate's blended labor rate until it is priced — never a per-line colour that is uniform
  across lines by construction

#### Scenario: A non-labor line shows no fabricated signal
- **WHEN** a material line is shown
- **THEN** it shows its price, cost, and net, and shows no profit-per-hour signal — a plain note, not
  a made-up figure

#### Scenario: Category subtotals summarize the mix
- **WHEN** an estimate has labor and material lines
- **THEN** the editor shows a labor subtotal and a material subtotal that sum from the lines shown

### Requirement: The estimate recomputes live, and stays usable without it
Saving an estimate SHALL always show the engine-true signal, roll-up, and per-line economics; this
SHALL be the guaranteed path and SHALL not depend on live updates. In addition, while a user edits, the
surface SHALL update those numbers to reflect the in-progress inputs, computed by `src/engine/`
**server-side** (never re-implemented in the client), **persisting nothing** until the user explicitly
saves. The live update SHALL be a progressive enhancement: when it is slow, failing, or offline, the
editor SHALL remain fully usable — the user can enter inputs and save and see the real numbers — and
the surface SHALL say the numbers update on save rather than stall or show a fabricated value. While a
recompute is in flight the surface SHALL keep showing the last good numbers.

#### Scenario: Editing updates the signal before saving
- **WHEN** the user changes a line's cost and does not save
- **THEN** the signal and roll-up update from an engine recompute of the in-progress inputs, and no
  change is persisted until the user saves

#### Scenario: The editor works when live updates don't
- **WHEN** the live recompute is unavailable (slow, failing, or offline)
- **THEN** the user can still enter inputs and save, saving shows the engine-true numbers, and the
  surface indicates the numbers update on save rather than showing a broken or fabricated figure

#### Scenario: A half-typed input never fabricates a number
- **WHEN** the in-progress inputs can't yet be priced (e.g. a partially typed amount)
- **THEN** the surface keeps the last good numbers with a plain hint, and shows no broken or invented
  figure

### Requirement: Unsaved edits are protected
Because saving is explicit, the editor SHALL protect a user's in-progress work: it SHALL keep a local
draft of the in-progress inputs and restore it if the surface reloads with unsaved changes (offering to
discard back to the saved version), and it SHALL warn before the user navigates away with unsaved
changes. The draft SHALL hold only the inputs the user entered (nothing derived) and SHALL be cleared
on a successful save. The server SHALL remain the source of truth; only an explicit save persists.

#### Scenario: Unsaved work survives a reload
- **WHEN** the user has entered lines and the surface reloads before they save
- **THEN** the editor restores the in-progress inputs and notes they are unsaved, with a way to discard
  back to the last saved version

#### Scenario: Leaving with unsaved changes warns first
- **WHEN** the user navigates away with unsaved changes
- **THEN** the editor warns before discarding rather than silently losing the work

### Requirement: Saving does not silently drop concurrently-added lines
A save SHALL NOT silently delete a line item that was added to the estimate after the editor loaded
(for example, a tool suggestion accepted meanwhile). When the estimate's line set on the server differs
from the set the editor loaded, the save SHALL surface that difference for the user to reconcile rather
than overwrite it.

#### Scenario: A line accepted while editing is not lost
- **WHEN** a suggestion adds a line to the estimate after the editor has loaded, and the user then saves
- **THEN** the save detects that the server's line set changed and surfaces it for review rather than
  silently deleting the added line

### Requirement: The estimate editor is accessible
The editor SHALL be usable by keyboard and screen reader, not sight alone: every input SHALL have an
associated text label (a placeholder is not a label); the profit signal and its updates SHALL be
announced to assistive technology (an `aria-live` region); icon-only controls (delete, duplicate,
reorder) SHALL carry accessible names; and colour SHALL never be the only carrier of meaning (every
signal colour is paired with text).

#### Scenario: The signal change is announced
- **WHEN** the signal changes after an edit or save
- **THEN** the change is announced to assistive technology, not conveyed by colour alone

#### Scenario: Controls have accessible names
- **WHEN** a screen-reader user reaches the delete, duplicate, or reorder control on a line
- **THEN** each control exposes an accessible name describing its action

### Requirement: A version can be duplicated
A user SHALL be able to duplicate an estimate version into a **new inactive version** that copies the
source's target margin, contingency, total-price override, and all line items **including any entered
per-line prices**. Duplicating SHALL NOT change which version is active and SHALL NOT re-seed the
project context. The duplicate SHALL be tenant-scoped, so one business can never duplicate another's
estimate.

#### Scenario: Duplicate copies inputs and lines
- **WHEN** the user duplicates a version that has an entered price on one line
- **THEN** a new inactive version is created with the same margin, contingency, override, and lines
  including that entered price, and the currently active version is unchanged

#### Scenario: Cross-tenant duplicate is blocked
- **WHEN** a user from business A attempts to duplicate business B's estimate
- **THEN** no estimate is created and nothing in business B changes

### Requirement: The editor surfaces version management
The estimate surface SHALL let a user see the project's versions with **each version's signal and
profit-per-hour**, switch between them, mark one **active**, create a new version, and duplicate the
current one — without leaving the estimate surface. Each version's signal SHALL be computed
independently by the engine.

#### Scenario: Versions show their own signals
- **WHEN** a project has two versions with different lines
- **THEN** the surface shows each version's own red/yellow/green signal and profit-per-hour, with the
  active version marked

#### Scenario: Switch and set active in place
- **WHEN** the user picks another version from the versions strip and marks it active
- **THEN** that version becomes the active one, any previously active version is no longer active, and
  the surface reflects the change
