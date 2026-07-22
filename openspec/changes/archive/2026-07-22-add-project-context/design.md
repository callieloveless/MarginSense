# Design — shared project context + suggestions queue

## Context

This is the substrate constitution §4 describes and §5 depends on. It is deliberately built
**before** any tool so the tool contract has real things to bind to: a read-only snapshot to
receive, and a suggestions queue to emit into. The safety guarantee — "tools suggest; users
confirm" — is only structural if the accept path is the single, server-side, tenant-scoped way
anything gets committed. That shape is the heart of this design.

## Goals / Non-Goals

**Goals**
- Typed context entries, one conversation, and a suggestions queue per project, tenant-scoped.
- An accept/dismiss state machine where **accept is the only mutation path** and dismiss is
  remembered.
- A typed, read-only project snapshot with no write path — the seam the tool contract will use.
- Seed context from estimate creation (the §4 one-way flow).

**Non-Goals**
- No AI tools, no tool runner/contract, no cost logging, no auto-triggers (next change).
- No new financial math — numbers come from `src/engine/`.
- No caching of derived values as truth.

## Decisions

- **Three tables, one capability.** `context_entries` (kind enum + typed JSON payload +
  author), `conversation_messages` (one thread per project, author + body), `suggestions`
  (status enum + target kind + payload + optional resolution). All carry non-null
  `business_id` and `project_id`, RLS on, following the established 0000–0002 pattern
  (enable RLS + per-business policy + `authenticated` grants in the same migration).
- **Typed payloads validated at the boundary.** Each entry kind and each suggestion target has
  a Zod schema; the payload column is JSON but never `any` — it is parsed on the way in and on
  the way out. *Alternative:* a column per kind — rejected as rigid; the kinds will grow.
- **Author is a small union.** `author = "user" | { tool: string }`. For this change the only
  authors are `user` and the estimate seam; tool authors arrive with the tool platform. Keeping
  the union now means tools slot in without a schema change.
- **Accept is a server-side, tenant-scoped state machine (the crux).** `src/context/` owns a
  pure `resolveSuggestion(suggestion, action)` that returns the next status + the committed
  effect *description*; the tenant-scoped DB helper performs the effect (insert a context
  entry, or add an estimate line item via the existing estimate helpers) and flips the status,
  in **one transaction**. A tool never touches this — it only creates `pending` rows. Dismiss
  sets `dismissed` and commits nothing. Re-accepting/-dismissing a non-pending suggestion is a
  no-op (idempotent).
- **Dismissed is remembered.** Dismissed suggestions stay in the table with `dismissed` status;
  the "pending queue" query filters to `pending`, so a dismissed proposal never re-surfaces.
  (De-duping *new* identical suggestions is the tool platform's concern, not this change's.)
- **Read-only snapshot is a plain assembled value.** `buildProjectSnapshot` gathers the
  project's entries + conversation + active-estimate roll-up (via the engine) into a frozen,
  typed object. It has methods to read, none to write. The tool contract (next change) will
  pass this in and accept only `Suggestion[]` back — this change defines those two types.
- **Estimate seam seeds a `fact`.** Estimate creation (the existing `createEstimate` path)
  additionally writes a `fact` entry with the job's cost/hour data. Wired here as a small,
  tenant-scoped call so the one-way flow is real; it stays a suggestion-free direct seed
  because the user is the one creating the estimate.

## Risks / Trade-offs

- [A tool could gain a write path] → the snapshot is read-only by construction and the accept
  path is server-side only; enforce in review, and keep the suggestion type the *only* return
  channel. Add a boundary test that a snapshot exposes no mutators.
- [JSON payloads drift to `any`] → every payload goes through a Zod schema in and out; no raw
  payload reaches a caller untyped.
- [Accept partially applies] → the effect + status flip run in one transaction; a failure rolls
  back both, leaving the suggestion `pending`.
- [Tenant leakage on accept] → accept resolves the suggestion, its target, and the write all
  through the tenant-bound handle; tenant-isolation tests cover cross-tenant read and accept.
- [Ambiguous "active estimate" for the snapshot] → reuse the existing one-active-version rule
  from `add-estimate-dashboard`; the snapshot reads the active version's roll-up.

## Migration Plan

One forward-only Drizzle migration adding `context_entries`, `conversation_messages`, and
`suggestions`, each `business_id` + `project_id` non-null with RLS policies and `authenticated`
grants in the same file. Additive; no backfill. Enum types for entry kind, message author kind,
suggestion status, and suggestion target kind.

## Open Questions

- Suggestion target kinds for v1: start with `context_entry` (commit a proposed entry) and
  `estimate_line_item` (add a line to the active estimate). More targets (revise a whole
  estimate, attach a document) arrive with the tools that need them.
- Photo entries reference an image; storage (tenant-scoped Supabase Storage) lands with Photo
  Advisor. Here a `photo` entry stores its metadata/annotations and a storage key placeholder.
