## Context

The `ready` session (`src/db/session.ts`) carries `authUserId` and `businessId` but not the
business's display *name*. A read path for the name already exists: `TenantDb.getBusiness()`
(memory + Drizzle impls) returns the bound business's `BusinessRow`, whose `.name` is non-null.
The shell header (`app/(app)/layout.tsx`) is a server component that already resolves the session;
the jobs list is a server component that already builds a session-bound `TenantDb`. So the only
work is resolving the name through the handle that's already there and rendering it — no new
backend, schema, or session field.

## Goals / Non-Goals

**Goals:**
- The active workspace name is visible on every authenticated screen (header).
- An empty jobs list names the active workspace.
- Zero new data-access seams; the name is read tenant-scoped through `getBusiness()`.

**Non-Goals:**
- No account switcher (switching stays sign-out / sign-in).
- No schema/migration, no change to session resolution, tenant isolation, the engine, or any tool.
- No change to how `current_business_id()` resolves (a separate, deferred hardening idea).

## Decisions

- **Resolve the name in the layout.** In `AppLayout`, when `session.status === "ready"`, call
  `tenantDbForSession(session.authUserId, session.businessId).getBusiness()` and render
  `business?.name` in the header (in place of / alongside the static "Profit Tracker" label). If
  the name is unexpectedly absent, fall back to the existing static label — never render an empty
  header. `unconfigured` / gated states are unchanged.
- **Thread the name into the jobs empty state, not a new query.** The jobs list already resolves a
  session-bound `TenantDb`; reuse it to read the workspace name (or pass it down from the layout is
  not possible across the server-component boundary cleanly, so the list resolves it itself via the
  same `getBusiness()` handle). Only the *empty* branch uses the name; the populated list is
  unchanged.
- **Display-only, text-first.** The indicator is plain text (paired with an icon at most), not a
  menu — consistent with the shell's phone-first, color-paired-with-text conventions. No
  interactivity, so it stays a server component.

## Risks / Trade-offs

- **One extra read per shell render (the header) and per empty jobs list.** `getBusiness()` is a
  single indexed lookup on the tenant table; negligible, and it runs only in the authenticated
  `ready` branch. Accepted.
- **Two call sites resolve the same name** (header + jobs empty state) rather than one. Threading a
  single value across the layout→page server-component boundary would add coupling for no real
  saving; two tenant-scoped reads of one small row is the simpler, safe choice.
- **Name could be stale within a request** only if the business were renamed mid-request — not a
  real scenario. No caching concern.
