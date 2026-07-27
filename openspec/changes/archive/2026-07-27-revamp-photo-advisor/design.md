# Design — revamp-photo-advisor (R6)

## Context

The built photo stack is per-photo: `project_photos` (one caption each), `advisePhoto` runs the
Photo Advisor tool on one image, and the context page shows a gallery grid. The prototype re-models
this around the **set**: many photos, one caption, analyzed together, shown as a history of sets. The
storage rules (private bucket, business-prefixed key, on-device downscale + EXIF strip, short-lived
signed URLs, tenant isolation) are correct and are **kept as-is** — they just now hang off a set.

## Goals / non-goals

- **Goal:** capture a set → post reliably → auto-analyze the whole set → recommendations saved on the
  set and in the queue; a history of sets, no gallery.
- **Goal:** posting photos never depends on a model call or good signal (job-site reality).
- **Non-goal:** code/permits per set (R8), material pricing (R7), a real background-job queue,
  per-photo captions, in-place set editing.

## Decision 1 — The set model

- **`photo_sets`**: `id`, `business_id` (RLS), `project_id`, `caption` (text), `analysis_status`
  (`analyzing` | `done` | `failed`), timestamps. One caption per set lives here.
- **`project_photos.set_id`**: nullable FK → `photo_sets` (cascade). Every new photo is created inside
  a set; the retired per-photo `caption` column is left in place (forward-only), unused going forward.
- **`suggestions.set_id`**: nullable FK → `photo_sets`. Tags which set produced a suggestion, so the
  set detail can list *its* recommendations and the history card can badge *N to review* — without a
  jsonb scan. It's additive provenance; the queue's behavior is unchanged (a suggestion with no set is
  still a normal suggestion). Inherits the suggestions RLS policy (same table).

Migration: `db:generate`, then hand-append the `photo_sets` RLS block (enable RLS, per-business policy
on `public.current_business_id()`, `GRANT … TO authenticated`, mirroring 0000). In-memory isolation
test for `photo_sets`. `set_id` columns inherit their tables' existing policies (no new policy).

## Decision 2 — Posting is reliable; analysis is decoupled and best-effort (the key call)

The user is on one bar of signal, and a vision model call is the slowest, flakiest thing here. So the
two are split:

- **`postPhotoSetAction`** (reliable, no AI): validate + store each prepared photo (the existing
  storage path), create the `photo_sets` row (`analysis_status = 'analyzing'`), attach the photos, add
  a `photo` context entry referencing the set, emit the event. Returns as soon as the photos are safely
  in the job. **This never calls the model** and never blocks on signal.
- **`analyzeSetAction`** (best-effort, retryable): runs Photo Advisor on the whole set and, on success,
  sets `analysis_status = 'done'`; on failure, `'failed'`. It is **auto-kicked by the client right
  after a successful post** (so it's automatic, not a manual tap) but is a *separate* call — if it's
  slow, fails, or the app is backgrounded, the set simply sits `analyzing`/`failed` and the set detail
  offers **Retry**. Posting already succeeded; nothing is lost.

Next server actions can't reliably run work after they return, so "auto-run" = the client fires
`analyzeSetAction` once immediately after `postPhotoSetAction` resolves. This is the honest way to get
automatic analysis without a job queue, and it keeps the model call off the critical path. (A real
background queue is a later infra concern — noted as a non-goal.)

Idempotency: `analyzeSetAction` is safe to retry — it dispatches through the existing
`dispatchAndCompose`, whose suggestion creation already **skips duplicates**, so a retry after a
partial failure doesn't double-propose.

## Decision 3 — What analysis produces, and the set's review state

Photo Advisor's output is unchanged in kind — `finding` context-entry suggestions and labor
`estimate_line_item` suggestions, all **pending** — but each carries the set id (`suggestions.set_id`)
and the findings reference the set. So:

- The **set detail** "See what MarginSense found" lists the set's pending suggestions (reusing
  `SuggestionCard` with the before→after profit preview), accept/dismiss in place.
- The **hub "Waiting on you"** shows the same durable suggestions (with no change — set-tagged or not).
- The history card's **badge** is derived: `analysis_status = 'analyzing'` → *analyzing…*;
  `'failed'` → *analysis didn't finish — retry*; `'done'` → count the set's pending suggestions:
  `> 0` → *N to review*, `0` → *No action* (found nothing, or all acted on).

"Recommendation saved on this set" = the set's suggestion(s). There is no separate saved-summary
artifact to keep in sync — the recommendations *are* the suggestions, surfaced in two places (which the
project-context spec already blesses: "a tool's result surfaces where it was run").

## Decision 4 — The tool contract: one image → a set

`photoAdvisorTool`'s validated input becomes a **set**: `{ setId, caption?, question?, images:
[{ photoId, storageKey, mediaType, imageBase64 }] }` (bounded count). The tool still receives only
pixels + text — no storage or DB handle (constitution §5) — and sends all images to the model in one
call so it reasons across the set. `adviseSet(tenantDb, port, { projectId, setId, question? })` reads
the set's photos tenant-scoped (a foreign set id reads back nothing), builds the input, and dispatches.
Findings reference the set (and may name an image within it); labor candidates are unchanged (minutes
only, engine costs, plausibility warning, never priced).

Model cost/size: several full images in one request is more tokens than one. Mitigate by capping images
per analysis (send the first N, thumbnails not full-size where the model allows) and `log`/note if a
set exceeds the cap. Cost observability per run is the existing `tool_run` accounting.

## Decision 5 — Placement: a dedicated Photos surface; retire the gallery

- **`/projects/[id]/photos`** — the history of sets (cards). **`/projects/[id]/photos/[setId]`** — the
  set detail (hero + thumbnails, the caption, the found-recommendations reveal, Retry when failed).
- The **hub tools grid** gains a **Photos** tile linking here, badged with the count of sets **to
  review** (honest count, like the other hub badges).
- The **Job-memory (context) page's Photos section is removed** — photos live on the Photos surface
  now. Photo *context entries* still exist in the shared memory (so tools "see" the photos); the memory
  page simply lists them as entries (its existing behavior) rather than a grid.

## Decision 6 — The set composer (capture)

- **Take photos**: capture several in a row (the file input's camera capture; each prepared on-device
  via the existing downscale + EXIF-strip pass, with its thumbnail). **From phone**: multi-select from
  the library, same preparation.
- One caption field for the whole set; **Post set** uploads the prepared photos + creates the set.
- Phone-first, big targets, `formatCents`-free (no money here), the disclaimer shown before analysis.

## Risks

- **Analysis never completes on bad signal.** By design the set is still posted; `analyzing`/`failed`
  is visible with Retry. The core value (photos in the job) doesn't depend on it.
- **Multi-image model cost.** Cap images per run; account per `tool_run`; note when capped.
- **Retry double-proposes.** Mitigated by the existing duplicate-skip in suggestion creation.
- **Signed URLs on the set detail.** Reuse the existing one-round-trip thumbnail signing; the full-size
  hero is signed on open (not at render), exactly as the current gallery does.
- **Scope.** Schema + tool contract + new surface + auto-analysis + gallery retirement — land in the
  committed stages below, each green (typecheck + vitest + build).

## Test plan

- **Isolation:** `photo_sets` cross-tenant read/write blocked; `business_id` + key prefix stamped from
  the handle, never input (mirrors the projects/photos isolation tests).
- **Post vs analyze split:** `postPhotoSetAction` stores the set + photos + context entry + emits with
  **no model call**; `analyzeSetAction` runs the tool and sets status; a failed analysis leaves the set
  posted with `status = 'failed'` and no orphan.
- **`adviseSet`** against the in-memory backends + mock model: a set of images yields findings that
  reference the set and labor `estimate_line_item` suggestions (minutes only), all pending and
  set-tagged; a retry skips duplicates; no material line and no price is ever produced; the post carries
  the disclaimer.
- **Badge derivation** (pure): status + pending-count → *analyzing…* / *N to review* / *No action* /
  *retry*.
- **Build** after the surfaces — the only check that catches App-Router/import issues.

## Stages (each a commit, each green)

- **A — schema + tenant seam:** `photo_sets` + `set_id` columns + migration + RLS; `PhotoSetBackend`
  (memory + Drizzle, wired); isolation + pure badge tests.
- **B — capture + history (no AI):** the set composer, `postPhotoSetAction`, the `/photos` history and
  `/photos/[setId]` detail (photos + caption, no analysis yet), hub Photos tile, retire the Job-memory
  gallery. Real build.
- **C — analysis:** reshape `photoAdvisorTool` to a set + `adviseSet`; `analyzeSetAction` +
  client auto-kick + Retry; the set-detail found-recommendations reveal; set-tagged suggestions +
  badge. `adviseSet` tests. Real build.
- **D — self-review + `/code-review` + archive + push.**
