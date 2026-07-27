# Tasks — revamp-photo-advisor (R6)

Photos re-modeled around the **set**; Photo Advisor analyzes a set, auto-run on post (decoupled).
Verify every stage with `npm run typecheck`, `npx vitest run`, and **`npm run build`**. Posting must
never depend on the model or a good connection.

## Stage A — schema + tenant seam (persistence + isolation)

- [x] A1. Schema: add `photo_sets` (`business_id`, `project_id`, `caption`, `analysis_status`
  `analyzing|done|failed`, timestamps); add nullable `project_photos.set_id` (FK → `photo_sets`,
  cascade); add nullable `suggestions.set_id` (FK → `photo_sets`) for set-tagged provenance. Retire —
  do not drop — the per-photo `caption`.
- [x] A2. `npm run db:generate`, then **hand-append the `photo_sets` RLS block** (enable RLS,
  per-business policy on `public.current_business_id()`, `GRANT … TO authenticated`, mirroring 0000).
  The `set_id` columns inherit their tables' policies (no new policy).
- [x] A3. `PhotoSetBackend` port with **memory** (in `tenant.ts`) + **Drizzle** (`drizzle-backend.ts`,
  inside `withAuthenticatedTx`) impls, wired in `session.ts`: `createPhotoSet`, `listPhotoSets`,
  `getPhotoSet`, attach photos to a set, `setAnalysisStatus`, `countSetPendingSuggestions`. Every
  method takes `businessId`; `TenantDb` binds its own — `business_id`/key prefix never from input.
- [x] A4. In-memory **tenant-isolation test** for `photo_sets` (cross-tenant read/write blocked;
  `business_id` stamped from the handle). Pure **badge** helper (`status` + pending count →
  analyzing / N to review / no action / retry) + test. typecheck + vitest green.

## Stage B — set capture + history (no AI)

- [x] B1. The **set composer**: **Take photos** (camera, several) + **From phone** (multi-select),
  each prepared on-device via the existing downscale + EXIF-strip pass (+ thumbnail); one caption for
  the set; **Post set**.
- [x] B2. `postPhotoSetAction` (reliable, no model): store each prepared photo through the existing
  storage path, create the set + caption, attach photos, add the `photo` context entry referencing the
  set, emit the event. A failed object write leaves no orphan set/photo/entry.
- [x] B3. `/projects/[id]/photos` — the **history of sets** (cards: count · caption · time · review
  badge, newest first). `/projects/[id]/photos/[setId]` — set detail (hero + thumbnails via signed
  URLs, the one caption); full-size signed on open, not at render.
- [x] B4. Hub tools grid gains a **Photos** tile (badge = sets to review). **Remove** the Job-memory
  (context) page's photo section — photos live on the Photos surface now (photo context entries remain).
- [x] B5. Phone-first pass; storage-unconfigured degrades to a plain "connect storage" state. `npm run
  build` green.

## Stage C — set analysis (Photo Advisor on a set, auto-run)

- [ ] C1. Reshape `photoAdvisorTool` input to a **set**: `{ setId, caption?, question?, images: [...] }`
  (bounded count); the tool sends all images in one model call and still gets no storage/DB handle.
  `advisePhoto` → `adviseSet(tenantDb, port, { projectId, setId, question? })` reads the set's photos
  tenant-scoped and dispatches; findings reference the set; labor candidates unchanged (minutes only).
- [ ] C2. `analyzeSetAction` (best-effort, retryable): runs `adviseSet`, sets `analysis_status`
  done/failed, tags produced suggestions with `set_id`. **Client auto-kicks it right after a successful
  post** (automatic, not a manual tap) — separate from the post; retry from the set detail on failure;
  retry skips duplicates (existing dispatch dedup).
- [ ] C3. Set-detail **"See what MarginSense found"** reveal: the set's pending suggestions via
  `SuggestionCard` + the before→after profit preview + accept/dismiss in place; the shared
  licensed-professional disclaimer shown before/around analysis. The same suggestions show in the hub
  "Waiting on you"; the set badge follows the pending count.
- [ ] C4. Tests: `adviseSet` against in-memory backends + mock model — a set yields set-referencing
  findings + labor `estimate_line_item` suggestions (minutes only), all pending + set-tagged; **no
  material line, no price ever**; the post carries the disclaimer; a retry skips duplicates; the post↔
  analyze split (post makes no model call; a failed analysis leaves the set posted). typecheck + vitest
  + build green.

## Stage D — self-review, code-review, archive

- [ ] D1. Self-review vs the spec deltas + critique lenses (tenant isolation on `photo_sets` + objects;
  tools-suggest/accept-to-commit; AI honesty — sourced findings, no fabricated price, disclaimer; money
  math untouched; job-site reality — post never needs AI/signal; client boundary — photos never public).
- [ ] D2. `/code-review` (user-triggered) or a high-effort adversarial inline pass; address findings;
  re-verify typecheck + vitest + build.
- [ ] D3. Update `PROGRESS.md` (R6 → done) + `relevant_notes.md` (the set model; post-vs-analyze split;
  live-Supabase items: apply the migration + prove `photo_sets` RLS live stay deferred).
- [ ] D4. Commit the stages, then archive (`openspec archive revamp-photo-advisor --yes`) as its own
  commit, then push.

## Deferred (explicit non-goals — not this change)

- Code & permit checks per set — R8 (Code & Permits).
- Material pricing — Material Finder (R7); Photo Advisor still only names materials.
- A real background-job queue with push updates (auto-run is client-kicked, best-effort).
- Per-photo captions / a loose gallery (removed); editing a set's photos after posting.
- Dropping the retired per-photo `caption` column (forward-only).
