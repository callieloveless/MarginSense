## Why

Today photos are handled one at a time: you upload a single picture, caption that one picture, and
Photo Advisor reads that one picture. But a contractor documenting a kitchen doesn't take *a* photo —
they shoot the wall wide, then the outlets close-up, then the subfloor: **a set**, that only makes
sense read together, with **one caption for the whole set**. The prototype makes that the model: you
*take photos* (or pull them from your phone), caption the **set**, and it posts to the job — and
MarginSense reads the **whole set at once** and saves what it found on that set. The screen is a
**history of sets**, not a gallery of loose thumbnails.

This change re-models job photos around the **set**, reshapes Photo Advisor to analyze a set as a
whole, and makes analysis **automatic when a set is posted** — the set shows *analyzing…* then the
recommendations it saved, revealed on the set and dropped into the job's "Waiting on you" queue.

## What Changes

- **Photos are sets.** A **photo set** is one or more photos plus **one caption**. A new `photo_sets`
  table holds the caption; each photo belongs to a set. The per-photo caption is retired.
- **Capture a set, not a photo.** The Photos surface offers **Take photos** (camera, several in a row)
  and **From phone** (pick several), you write **one caption for the set**, and **Post set** stores
  them together (each photo still downscaled + EXIF-stripped on-device, stored under the business key,
  shown via short-lived signed URLs — all unchanged).
- **A history of sets, no gallery.** The Photos surface is a **history** of the job's sets — each a
  card with its photo count, caption, time, and a review badge (*analyzing…* / *N to review* /
  *No action*). Opening a set shows its photos (hero + thumbnails), the one caption, and **See what
  MarginSense found**. The old per-photo grid on Job memory is removed.
- **Analysis is per-set and automatic.** When a set is posted, Photo Advisor is run on the **whole
  set** (all images + the caption) **once, automatically** — decoupled from the post so a slow or
  failed model call never blocks the photos landing in the job (the set sits *analyzing…* and can be
  retried; posting itself needs no AI and no signal). What it finds is **saved on the set** (revealed
  there with confirm/dismiss) **and** lands in the job's **"Waiting on you"** queue — the same durable
  suggestions, surfaced in both places.
- **Findings reference the set.** A finding now names the **set** it came from (and may name a photo
  within it) rather than a single loose photo; severity, the labor-as-line-items rule (minutes only,
  engine costs), the "names materials but never prices them → Material Finder" rule, the
  licensed-professional disclaimer, the AI-unconfigured degrade, and "nothing commits until you
  accept" are all **unchanged** — they now apply to a set.

## Financial-model interaction (called out per the rules)

None changes. Photo Advisor still proposes **labor** as `estimate_line_item` suggestions carrying
**minutes only**; the cost is derived by the engine from the business's burdened rate, and the
before→after profit-per-hour preview is the existing one. It still **never prices** anything and never
proposes a material line (a fabricated or zero-cost line would overstate profit). Money stays integer
cents, minutes integer, percentages basis points.

## Capabilities

### Modified Capabilities
- `job-photos`: photos belong to a **set** with **one caption per set**; capture composes a set
  (take several / pick several) and posts them together; the surface is a **history of sets** (the
  per-photo gallery on the context surface is retired); the `photo` context entry references the set.
  Storage, on-device downscale + EXIF strip, signed URLs, tenant isolation, and graceful degradation
  are unchanged and now apply per set.
- `photo-advisor`: Photo Advisor reads a **whole set** (its photos + the one caption) rather than a
  single photo, **runs automatically when the set is posted** (decoupled from posting so it never
  blocks it), **saves what it finds on the set** and into the shared queue, and its findings reference
  the set. Severity, labor-as-minutes, never-prices/hand-to-Material-Finder, the disclaimer,
  AI-unconfigured degrade, and accept-to-commit are unchanged.

## Impact

- **Schema:** a forward-only migration adds the **`photo_sets`** table (`business_id`, `project_id`,
  `caption`, an analysis status, timestamps) with its **RLS** block (per-business policy +
  `GRANT … TO authenticated`, mirroring migration 0000) and adds a nullable **`set_id`** to
  `project_photos` (FK → `photo_sets`, cascade). The per-photo `caption` is left in place but retired
  (forward-only; not dropped). No live data yet.
- **Tenant seam:** a `PhotoSetBackend` port (memory + Drizzle impls, wired in `session.ts`) —
  `createPhotoSet`, `listPhotoSets`, `getPhotoSet`, attach photos to a set, set the analysis status,
  and count a set's pending suggestions. `business_id` and the key prefix are stamped from the handle;
  an in-memory isolation test proves cross-tenant reads/writes are blocked.
- **Tool contract:** `photoAdvisorTool`'s validated input becomes a **set** (an array of images + the
  set caption + optional question) instead of one image; the tool still receives only pixels + text
  (no storage/DB handle). `advisePhoto` → `adviseSet`.
- **Code:** the new Photos surface (`/projects/[id]/photos` history + `/photos/[setId]` detail) and set
  composer; a reliable `postPhotoSetAction` (stores set + photos + context entries + emits) separate
  from a best-effort `analyzeSetAction` (auto-kicked after post; retryable); the hub tools grid gains a
  **Photos** tile with a *sets-to-review* badge; the Job-memory photo section is removed. Reuses the
  photo storage path, `SuggestionCard` + the existing accept/dismiss, the shared disclaimer, and the R1
  primitives.
- **No touch:** `src/engine/`, the estimate math, the client document, Code Finder / Material Finder.

## Non-goals

- **Code & permit checks per set** — stays R8 (Code & Permits). This change is Photo Advisor only.
- **Material pricing** — Photo Advisor still names materials and hands off to **Material Finder** (R7).
- **True background analysis with push updates** — the auto-run is client-kicked and best-effort
  (retryable), not a server job queue; a real queue is a later infra concern.
- **Per-photo captions / a loose gallery** — deliberately removed; the caption is the set's.
- **Editing a set's photos after posting** (add/remove within an existing set) — post is the unit for
  now; a later nicety.
- **Dropping the retired per-photo `caption` column** — forward-only; left unused.
