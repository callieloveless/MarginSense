# Design — revamp-project-hub (R4-hub)

## Context

The thin job page (`app/(app)/projects/[id]/page.tsx`) shows a header, three link buttons
(context / tools / documents), and the estimate list. Meanwhile the **context page**
(`[id]/context/page.tsx`) already composes the pieces the prototype wants on the *landing*
surface: the `ProfitHeader`, the pending-suggestion queue (`SuggestionCard` + `previewForSuggestion`),
the typed context entries, and the conversation. R4-hub re-homes that composition onto the job's
default surface and leaves the context page as the deep archive.

Nothing here is new domain logic. The design decisions are about **what the hub loads**, **which
badges are honest**, and **how it stays calm when the job is brand new** — plus not duplicating a
control in a way that confuses (the critique's "no dead/duplicate controls" lens).

## Goals / non-goals

- **Goal:** open a job → see signal, waiting-on-you, activity, and tools on one screen, all real.
- **Goal:** additive only — no schema, no engine, no change to shipped `project-context` behavior.
- **Non-goal:** chain teaser / rules (L2), client answers (L1), branding badge (R9), tool reshapes
  (R6–R9), moving the memory page.

## Decision 1 — The hub is the job's default surface; the memory page stays

`/projects/[id]` becomes the hub. `/projects/[id]/context` is unchanged and becomes reachable via
the tools grid's **Job memory** tile. The hero's existing "no active estimate → build one" link
already points at `/projects/[id]`, which is now the hub whose Estimates section holds the
new-estimate form — so that CTA lands on the form.

## Decision 2 — Duplicate-queue question: the hub is the triage home, the memory page keeps the queue too

The `project-context` spec says a tool's result "surfaces where it was run" and the queue is "the
project's shared record." The pending queue is therefore legitimately a **single durable queue
rendered on more than one surface**, each acting in place — not two competing queues. So:

- The hub shows **"Waiting on you"** as the primary triage surface.
- The context/memory page keeps its Suggestions section (a tool run started there still shows its
  result there).

Both bind the **same** `acceptSuggestionAction` / `dismissSuggestionAction` server actions
(already in `[id]/context/actions.ts`), so accepting on either surface commits once and the item
leaves both. No new action, no new state. This satisfies the spec without spec surgery; it is not a
"dead control" because both surfaces act on the one shared queue.

## Decision 3 — What the hub loads (one pass, tenant-scoped)

A single `Promise.all` through the bound `tenantDb`:

| Load | Source | Feeds |
|------|--------|-------|
| `getProject(id)` | projects | identity sub-line, not-found gate |
| `loadJobProfit(tenantDb, id)` | estimates + settings + engine | the hero + suggestion previews (shared loader, so hero and previews agree) |
| `listEstimates(id)` | estimates | the Estimates version list |
| `listPendingSuggestions(id)` | suggestions | "Waiting on you" |
| `listContextEntries(id)` + `listMessages(id)` | context | the compact activity feed (most-recent slice) |
| photo count | `hasPhotoStorage ? listPhotos(id).length : 0` | Photos-tile badge (omit tile badge when storage not ready) |
| latest client document | existing documents read (e.g. `getLatestDocument(id)` / `listDocuments`) | Client-document-tile badge (*draft* / *shared* / none) |

`loadJobProfit` already calls `listEstimates`; to avoid a double round trip the hub can reuse the
list it loads and pass the active estimate through, or accept the one extra cheap read. Correctness
first — a second `listEstimates` is acceptable; optimize only if the build shows it matters.

## Decision 4 — Honest badges only

A tile shows a badge **only** when a real count/status backs it:

- **Job memory (context):** photo count when photo storage is ready and > 0; otherwise no badge.
- **Client document:** `draft` / `shared` when a document exists; otherwise no badge (the tile
  still opens the documents surface to generate one).
- **Tools:** no fabricated count. (Pending items are already surfaced as "Waiting on you"; the
  Tools tile just opens the tools surface.)

No tile links to an unbuilt tool. When the tools themselves get their own surfaces (R6–R9), those
changes can enrich these badges; R4-hub does not pre-empt them.

## Decision 5 — Calm empty states (brand-new job)

A job created moments ago has no active estimate, no suggestions, no activity. Each region degrades
to a plain, encouraging state, never a zero-dressed-as-data:

- **Hero:** the existing absent-safe "no active estimate yet — build one" state.
- **Waiting on you:** hidden or a one-line "Nothing waiting — tools will drop suggestions here."
- **Activity:** "No activity yet."
- **Estimates:** the existing "add your first version" empty state.

## Decision 6 — Compact activity feed

The feed is a *recent* slice (e.g. last ~5 combined entries + messages), newest first, each a
one-line plain-language row reusing the context page's `describeEntry` / author-label helpers (or a
small shared helper if those need to move to `app/_lib/`). A "See all in job memory →" link goes to
the context page. It is read-only; posting a message still happens on the memory page (no new
compose box on the hub in R4).

## Risks

- **Extra reads on the landing page.** Mitigate by loading in one `Promise.all` and keeping the
  activity slice small; verify with `npm run build`.
- **Perceived duplication of the queue** across hub and memory page. Mitigated by framing (hub =
  "Waiting on you" triage; memory = the archive) and by both binding the one shared action so an
  accept anywhere clears everywhere. Documented here per Decision 2.
- **Helper extraction churn.** If `describeEntry`/author labels move to a shared lib, keep the
  context page importing the same helper so behavior can't drift.

## Test plan

- Reuse existing engine/estimate/profit unit tests (unchanged math).
- A hub-composition smoke: the hero, the queue, and the feed render for a job with an active
  estimate + a pending line-item suggestion, and the queue's preview equals the post-accept EPH
  (already guaranteed by `previewForSuggestion`; assert at the page-glue level if cheap).
- Empty-job render: no active estimate, no suggestions, no activity → plain states, no thrown
  number. (Server-component render is covered by the build; add a small unit test around any new
  pure helper such as the sub-line builder and the badge selector.)
- Tenant scope is inherited (every read goes through the bound `tenantDb`); no new backend to
  isolation-test, but the hub must never accept an id from the client for its reads — it uses the
  route param resolved against the session, exactly as the thin page does.
