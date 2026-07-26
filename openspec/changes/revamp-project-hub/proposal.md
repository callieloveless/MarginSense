## Why

A job's page is the contractor's command center — but today it's three link buttons over an
estimate list. Everything the prototype puts on that screen already exists in the app, just
scattered: the profit-per-hour signal lives on the context page, the pending-suggestion queue
lives on the context page, the conversation and typed entries live on the context page, and the
tools live one more tap away. The contractor opens a job and has to go hunting.

This change makes the job's default surface the **hub** the prototype shows: open a job and
immediately see *is this job pulling its weight* (the profit-per-hour hero), *what's waiting on my
confirm* ("Waiting on you"), *what's happening* (a compact activity feed), and *what I can open*
(a tools grid) — composing pieces that already exist, with **no new data and no new write path**.
The deep "job memory" page stays exactly where it is, one tap away, as the full archive.

## What Changes

- **The job page (`/projects/[id]`) becomes the hub**, replacing the thin header + three links +
  estimate list with a single command-center screen:
  - **Identity:** client name and a plain sub-line built from the R4 setup fields that are set —
    address · job type · crew · start window — nothing fabricated when a field is blank.
  - **Profit-per-hour hero** (the reused `ProfitHeader` / job-profit loader): the active
    estimate's red/yellow/green signal and EPH-vs-target, color always paired with text. With no
    active estimate it shows a plain "build your first estimate" state, never a broken number.
  - **Tools grid:** tiles that open each surface that **exists today** — Job memory (context),
    Tools, Client document — each carrying a **live badge only where a real count or status
    exists** (e.g. a photo count, a client-document *draft/shared* state). No badge is invented,
    and no tile links to a tool that isn't built yet.
  - **"Waiting on you":** the project's **pending-suggestion queue**, reusing the built
    `SuggestionCard` with its before→after profit-per-hour preview and Confirm/Dismiss acting in
    place — the same durable queue, surfaced on the hub because this is where you triage.
  - **Activity feed:** a compact, calm timeline of the job's most recent context entries and
    conversation posts, with a link through to the full job memory.
  - **Estimates:** the version list and "new estimate" action stay on the hub, so nothing that
    the thin page did is lost.
- **The job-memory page (`/projects/[id]/context`) is unchanged** — still the full archive
  (photos, every context entry, the whole conversation, post-a-message) and still the home the
  hero's tools-grid "Job memory" tile opens.

## Financial-model interaction (called out per the rules)

**None.** This is a presentation composition. Every number shown — EPH, the signal, each
suggestion's before→after — is read from the existing engine roll-up via the existing
`loadJobProfit` / `previewForSuggestion` loaders. No total, threshold, EPH, or formula changes;
`src/engine/` is not touched.

## Capabilities

### New Capabilities
- `project-hub`: the job's default command-center surface — profit-per-hour hero, tools grid with
  honest live badges, the "Waiting on you" pending-suggestion queue with in-place accept/dismiss
  and before→after preview, a compact activity feed, and the estimate versions — composing the
  profit signal and shared context on one screen, tenant-scoped, read-only (the only mutation is
  the existing accept/dismiss).

### Modified Capabilities
- *(none)* — the pending-suggestion queue and the persistent profit signal are already specified
  surface-agnostically in `project-context` ("a tool's result surfaces where it was run"; "the job
  surface keeps the profit signal in view"). The hub is a new surface that honors those
  requirements; it does not change them.

## Impact

- **Schema:** none. No migration, no new table, no RLS change.
- **Engine:** none.
- **Code:** `app/(app)/projects/[id]/page.tsx` is reshaped from the thin page into the hub,
  loading the composition in one pass (project, estimates, pending suggestions, recent
  entries/messages, a photo count, the latest client document) through the tenant handle and
  reusing `ProfitHeader`, `SuggestionCard`, `loadJobProfit`/`previewForSuggestion`, the R1 UI
  primitives, and the existing `acceptSuggestionAction`/`dismissSuggestionAction` server actions.
  A small hub components file (tools grid + activity feed) may be added under `app/(app)/projects/[id]/`.
- **No touch:** `src/engine/`, `src/db/` schema/backends, the context page, the tools, the client
  document generator.

## Non-goals

- **The chain teaser** and **auto-run rules** surface (L2) — the hub links to tools; it does not
  show a tool-graph or a rules editor.
- **Client answers / the ask-the-client loop** (L1) — not on the hub.
- **A branding "!" nudge badge** (R9) — no client-document branding state exists yet to badge.
- **Reshaping the tools themselves** (Photo Advisor R6, Material Finder R7, Code & Permits R8,
  Client document R9) — the grid opens today's surfaces as they are.
- **Moving or removing the job-memory page** — it stays as the full archive.
