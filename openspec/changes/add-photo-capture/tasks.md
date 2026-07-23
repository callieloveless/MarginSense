## 1. Stage A — the photo domain module (pure, no framework/DB)

- [x] 1.1 Create `src/photos/photos.ts`: accepted content types (`image/jpeg`, `image/png`,
      `image/webp`), `MAX_UPLOAD_BYTES`, `MAX_LONG_EDGE_PX` (1568) and `THUMB_LONG_EDGE_PX`
      (400) as named constants — one home, no magic numbers scattered in UI or actions.
- [x] 1.2 Add pure `photoObjectKey(businessId, projectId, photoId)` and
      `photoThumbKey(...)` deriving `"{business}/{project}/{photo}.jpg"` — the only place a key
      is built, so the tenant prefix can never come from input.
- [x] 1.3 Add `validateUpload({ contentType, byteSize })` returning a typed ok/error result with
      plain-language messages, plus `scaledDimensions(w, h, longEdge)` for the client resizer.
- [x] 1.4 Export from `src/photos/index.ts`; keep the module free of Next/Drizzle/Supabase
      imports (schema **types only** if needed) so it stays unit-testable in isolation.
- [x] 1.5 Unit-test `src/photos/photos.test.ts`: key derivation (including that a caller-supplied
      key or business id is ignored), accepted/rejected content types, the size cap boundary, and
      `scaledDimensions` (landscape, portrait, square, already-small = unchanged).

## 2. Stage A — persistence: table, migration, RLS

- [x] 2.1 Add `projectPhotos` to `src/db/schema.ts`: non-null `business_id` + `project_id`,
      `storage_key`, `thumb_key`, `content_type`, `byte_size`, `width`, `height`, nullable
      `caption`, `uploaded_by` (users), timestamps; export `ProjectPhotoRow` /
      `NewProjectPhotoRow`.
- [x] 2.2 `npm run db:generate` → migration `0007_*`; **hand-append the RLS block** mirroring
      `0000`: enable RLS, a per-business `FOR ALL` policy keyed on
      `public.current_business_id()` (USING + WITH CHECK), and `GRANT … TO authenticated`.
- [x] 2.3 Hand-append the storage block to `0007`: idempotent private-bucket insert and a
      `storage.objects` policy restricting the bucket to
      `(storage.foldername(name))[1] = public.current_business_id()::text`, with a comment
      noting the dashboard fallback if the migration role cannot create it.
- [x] 2.4 Add `PhotoBackend` (rows: `listByProject`, `getById`, `insert`, `updateCaption`,
      `deleteById`) and `PhotoStorageBackend` (objects: `putObject`, `signedUrl`,
      `deleteObject`) to `src/db/tenant.ts` — every method taking `businessId` — as optional
      entries on `TenantBackends` with private `#photos` / `#photoStorage` getters that throw
      when unwired.
- [x] 2.5 Add the `TenantDb` methods that always pass the bound business id: `listPhotos`,
      `getPhoto`, `addPhoto`, `setPhotoCaption`, `deletePhoto`, `signedPhotoUrls` — each
      deriving the storage key from `src/photos/` rather than accepting one.
- [x] 2.6 Add `createMemoryPhotoBackend` + `createMemoryPhotoStorageBackend` in `tenant.ts` over
      shared cross-tenant arrays/maps (mirroring the other memory backends) so isolation tests
      have something to prove against.
- [x] 2.7 Add the Drizzle `PhotoBackend` impl in `src/db/drizzle-backend.ts` running inside
      `withAuthenticatedTx` so RLS applies.
- [x] 2.8 Add `src/db/photo-storage.ts`: the Supabase Storage impl over the **session-scoped SSR
      client** (never the service-role key) + `resolvePhotoStorage()` returning
      `configured | unconfigured`, mirroring `resolveModelPort()`; add the bucket env var to
      `.env.example`.
- [x] 2.9 Wire both backends in `src/db/session.ts`, leaving storage unwired when unconfigured.
- [x] 2.10 Tenant-isolation tests in `src/db/photos.test.ts`: business A cannot list, read, sign,
      caption, or delete business B's photo; `business_id` and the storage key prefix are stamped
      from the handle even when input supplies them; deleting removes both objects.

## 3. Stage B — the upload path and the event

- [ ] 3.1 Add `app/(app)/projects/[id]/context/photo-actions.ts` with `uploadPhotoAction`:
      resolve the session server-side, re-validate content type + byte size via `src/photos/`,
      generate the photo id, write both objects, insert the row, then add the `photo` context
      entry (`{ storageKey }`) authored by the user — no suggestion, no tool run.
- [ ] 3.2 Implement the failure path from design §5: if the row or context-entry write fails,
      delete the objects already written and return a plain error, so no orphan row or entry
      survives.
- [ ] 3.3 Emit `photo.uploaded` after a successful upload via the existing
      `src/tools/triggers.ts` seam, with deps over the tenant handle and the resolved model
      port; wrap it so a subscriber failure cannot fail a completed upload. Leave `TRIGGERS`
      empty.
- [ ] 3.4 Add `setPhotoCaptionAction` and `deletePhotoAction` in the same file, both
      session-resolved and tenant-scoped, revalidating the job context path.
- [ ] 3.5 Test the emit contract: `photo.uploaded` with no subscribers runs no tool, records no
      `tool_run`, creates no suggestion, and returns normally.
- [ ] 3.6 Test the upload action's ordering/rollback against the memory backends: a failing row
      insert leaves no objects, no row, and no context entry.

## 4. Stage C — the phone-first UI

- [ ] 4.1 Add the client uploader component (`"use client"`) under
      `app/(app)/projects/[id]/context/`: file input with `capture`, canvas downscale to
      `MAX_LONG_EDGE_PX`, JPEG re-encode (which drops EXIF/GPS), a `THUMB_LONG_EDGE_PX`
      thumbnail from the same pass, and a clear message when an image can't be decoded (HEIC).
- [ ] 4.2 Add the gallery to the job context page: a phone-first grid of thumbnails via
      short-lived signed URLs, each with its caption, a caption editor, and delete with
      confirmation.
- [ ] 4.3 Render the "connect storage" state when `resolvePhotoStorage()` is unconfigured —
      uploader disabled, plain explanatory copy, nothing thrown.
- [ ] 4.4 Raise `experimental.serverActions.bodySizeLimit` in `next.config.mjs` above
      `MAX_UPLOAD_BYTES`, with a comment tying it to the constant.
- [ ] 4.5 Check the surface at phone width first; keep color paired with text and every action
      labelled.

## 5. Verification and close-out

- [ ] 5.1 `npm run typecheck`, `npx vitest run`, and `npm run build` green after each stage
      (the build is the only check that catches Turbopack/App-Router issues; relative imports in
      `src/` stay extensionless).
- [ ] 5.2 Add the deferred live-infra items to `relevant_notes.md`: create the private bucket,
      apply `0007`, prove a signed URL from business A cannot read business B's object, and
      confirm signed-URL expiry.
- [ ] 5.3 Update `PROGRESS.md`: #8 split into 8a (this change) and 8b (Photo Advisor, the vision
      tool), with 8a's status.
- [ ] 5.4 `openspec validate add-photo-capture --strict`, then archive on its own commit.
