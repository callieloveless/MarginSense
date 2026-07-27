## Why

A contractor made a new job, clicked it, and it "didn't work" — a 404. The job was saved
correctly; it just belonged to a *different account* than the one they were viewing, and the app
gave no signal of which workspace they were signed into. When your own jobs can silently vanish
depending on an invisible account, you stop trusting that the app is holding your work. The
create→read path is provably correct (a new regression test pins it); the missing piece is that
the active workspace is never shown, so tenant isolation looks like data loss.

## What Changes

- **Add a persistent "active workspace" indicator** to the authenticated shell header — the name of
  the business the current session resolves to (e.g. shown where the header now reads
  "Profit Tracker"). Resolved server-side through the existing tenant-scoped `getBusiness()` handle;
  no client-supplied id, no new data-access seam.
- **Name the workspace in the jobs-list empty state** — when a workspace has zero jobs, the empty
  state reads "No jobs yet in <workspace>" (plus the existing "+ New job" action) instead of a
  generic blank, so an empty list is legibly *this account's* empty list, not a lost-data mystery.

## Non-goals

- **No account switcher.** This change only *shows* the active workspace; switching accounts stays
  the existing sign-out / sign-in flow. (A future change can add in-app switching.)
- **No schema or migration change**, no change to tenant isolation, session resolution, the
  financial model, or any tool. Reads only, through the existing bound handle.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `app-shell`: add a requirement that the shell shows the active workspace (a header indicator plus
  a workspace-named jobs empty state). No change to the shell's existing "no new data path" or
  auth-gating guarantees — the workspace name is read through the existing tenant-scoped handle.

## Impact

- `app/(app)/layout.tsx` — resolve the active workspace name via `tenantDbForSession(...).getBusiness()`
  and render it in the header.
- The jobs-list screen (`app/(app)/projects/…`) — thread the workspace name into its empty state.
- No changes to `src/engine/`, `src/db/` schema/migrations, session resolution, or any tool. The
  only new read is the already-existing, tenant-scoped `getBusiness()`.
