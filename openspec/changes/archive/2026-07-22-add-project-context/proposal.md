# Add shared project context and the suggestions queue

## Why

Every Tool MarginSense will add (Material Finder, Photo Advisor, Code Finder, Client Estimate
Doc) presumes one thing that does not exist yet: a project's **shared context** — the "one
job, one memory" substrate (constitution §4). Without it there is nowhere for a tool's
findings to live, no single conversation for tools to post into, and no queue through which a
tool's proposed change reaches the user for confirmation. §5 makes the safety rule structural:
a tool receives a **read-only** snapshot and can only emit **suggestions**; the estimate or a
context fact changes **only** when the user accepts. That guarantee needs a real suggestions
queue and a real read-only snapshot to hang on. This change builds that substrate — and only
that — so it stands before any tool ships (the tool platform + Material Finder is the next
change).

## What Changes

- **Typed context entries** per project (constitution §4.1): `finding`, `material`,
  `code_ref`, `photo`, `fact` — each a structured, tenant-scoped row with a typed payload and
  an author (the human owner or, later, a named tool). Read/list/add through tenant-scoped
  helpers.
- **One conversation per project** (§4.2): a single message thread all tools read from and
  post into, attributed to the author (`user` or a tool name). There are **no** per-tool
  histories — one project, one thread.
- **Suggestions queue** (§4.3, §5): proposed changes with status `pending | accepted |
  dismissed`. A suggestion names its target (a context entry to commit, or an estimate line
  item to add) and its payload. **Accepting is the only path** that commits the proposed
  context entry or estimate change; **dismissing is remembered** so the same suggestion does
  not nag. Nothing is auto-applied.
- **Read-only project snapshot** (§5 rule 1): a single typed, read-only view assembling a
  project's context entries + conversation + active estimate roll-up, for a (future) tool to
  consume. It exposes no write path — the only thing that can come back is a `Suggestion`.
- **Estimate → context seam** (§4): creating an estimate seeds the project context with the
  job's cost/hour data (a `fact` entry), wiring the one-way default flow.
- **Tenant isolation**: every new table carries a non-null `business_id` with RLS on; the
  suggestion-accept path is server-side and tenant-scoped. Tenant-isolation tests on each new
  table.

## Capabilities

### New Capabilities
- `project-context` — typed context entries, the single per-project conversation, the
  suggestions queue with accept/dismiss, and the read-only project snapshot that tools will
  consume.

### Modified Capabilities
- None. Consumes `tenancy-foundation` (the project spine + tenant access) and reads the
  `estimates` roll-up via the engine when a suggestion targets a line item. It does not change
  the estimate or engine capabilities.

## Impact

- **New code:** Drizzle schema + migration for `context_entries`, `conversation_messages`, and
  `suggestions` (all non-null `business_id`, RLS on); tenant-scoped `src/db/` helpers +
  isolation tests; a `src/context/` module for the typed entry payloads, the read-only
  snapshot assembly, and the accept/dismiss state machine (pure, engine-only for any numbers);
  the estimate-creation seam that seeds a `fact`. UI is a minimal project-context view
  (entries list + conversation + pending suggestions with accept/dismiss) under
  `app/(app)/projects/[id]/`.
- **Depends on:** `tenancy-foundation` (projects, tenant access, RLS pattern) and
  `add-estimate-dashboard` (the estimate the seam seeds from and a suggestion may target).
- **Feeds:** the tool platform + every tool — they read the read-only snapshot and emit
  suggestions into this queue.

## Non-goals

- **No AI tools** — Material Finder, Photo Advisor, Code Finder, Client Estimate Doc are their
  own changes. This is the substrate only; the sole author of entries/messages/suggestions for
  now is the user (plus the estimate seam).
- **No tool contract / runner** — the uniform tool `run(ctx)` interface, cost logging, and
  auto-triggers belong to the tool-platform change. This change defines the read-only snapshot
  shape and the suggestion type the contract will use, but not the runner.
- **No new financial math** — any number shown comes from `src/engine/`.
- **No write path from a snapshot** — a tool can never mutate context or an estimate; only an
  accepted suggestion does, server-side.
