# Tasks — show-active-workspace

## Stage A — Header indicator
- [x] In `app/(app)/layout.tsx`, when `session.status === "ready"`, resolve the workspace name via
      `tenantDbForSession(session.authUserId, session.businessId).getBusiness()`.
- [x] Render `business?.name` in the header (in place of / beside the static "Profit Tracker"
      label), text-first; fall back to the existing static label if the name is absent. Leave the
      `unconfigured` and gated branches unchanged.
- [x] Verify: `npm run typecheck` and `npm run build` (App-Router / server-component read is valid).

## Stage B — Workspace-named empty jobs state
- [x] In the jobs-list screen, when the list is empty, read the workspace name via the existing
      session-bound `getBusiness()` handle and render "No jobs yet in <workspace>" alongside the
      existing "+ New job" action. Populated list unchanged.
- [x] Verify: `npm run typecheck`, `npx vitest run`, and `npm run build`.

## Stage C — Guard + docs
- [x] Confirm the existing `create-read-consistency.test.ts` still passes (the create→read guard).
- [x] Note in `relevant_notes.md`: multiple auth accounts map to separate workspaces; a job made on
      one account is invisible on another by design — the header indicator makes this legible.
- [x] Flip these tasks to `- [x]` as completed; archive with `openspec archive show-active-workspace`.
