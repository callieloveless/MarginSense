# Add job photo capture & storage (Photo Advisor, stage 8a)

## Why

John diagnoses jobs with his phone camera — he photographs the rot under the tub, the panel,
the crawlspace, and asks someone what he's looking at and what it will cost. Today MarginSense
has no way to hold that photo: the shared context has a `photo` entry kind (constitution §4.1)
with nowhere to put the bytes, so the job's memory is missing the single most common thing a
contractor actually captures on site. Before any vision tool can advise on a photo (8b) or any
code lookup can auto-trigger from one (#9), the photo has to exist as a **tenant-isolated,
access-controlled asset** on the job. That is this change, and nothing else — it ships useful
on its own (a job's photos, on the phone, in the shared context) with **zero AI involved**.

Photos of people's homes are among the most sensitive data the product will ever hold
(constitution §7), so the storage slab gets its own review rather than riding along inside a
vision tool.

## What Changes

- **New `job-photos` capability** — a job photo is a first-class, tenant-scoped asset:
  - **`project_photos` table** (migration `0007`): non-null `business_id` + `project_id`,
    `storage_key`, `thumb_key`, `content_type`, `byte_size`, `width`/`height`, optional
    `caption`, uploader, timestamps — **RLS on**, per-business policy, `GRANT … TO
    authenticated`, mirroring migration `0000`.
  - **A `PhotoStorageBackend` port** in the `TenantDb` seam (`src/db/tenant.ts`) with a
    **memory impl** (powers the tenant-isolation tests) and a **Supabase Storage impl** wired
    in `session.ts`. Objects live under a **`business_id/project_id/…` key prefix in a private
    bucket**; the app never mints a public URL — display uses **short-lived signed URLs**, and
    both the row and the object are read/written only through the tenant handle, which stamps
    `business_id` itself.
  - **Upload is an outer-layer user action, not a tool.** A server action resolves the business
    from the session, validates type/size, writes the object, inserts the row, and adds a
    **`photo` context entry** so the job's one memory sees it (constitution §4). No AI is
    involved and nothing is a suggestion — the user *is* the author.
  - **Client-side preprocessing before a byte leaves the phone**: downscale the long edge to
    ≤1568px, re-encode to JPEG (which **strips EXIF, including home GPS coordinates** — §7),
    and produce a ~400px thumbnail in the same pass. No server-side image pipeline, no new
    dependency.
  - **Caption, delete, and a phone-first gallery** — a short note on a photo (which becomes
    diagnostic context for 8b), deletion that removes the row **and** both storage objects
    tenant-scoped, and a grid of a job's photos on the **Job context** page, with an upload
    entry point that 8b's tool panel reuses.
- **The photo-upload event exists cleanly.** A successful upload emits **`photo.uploaded`**
  through the existing dormant trigger seam (`src/tools/triggers.ts`) carrying the project and
  the photo. `TRIGGERS` stays empty, so today it is a **no-op** by the tool-platform spec —
  #9 subscribes Code Finder by adding one entry, changing nothing here.
- **Storage stays deferred-safe.** With no Supabase project configured the storage port reports
  `unconfigured` and the surface renders a "connect storage" state — exactly how `src/ai/`
  behaves without a key — so everything is buildable, typed, and unit-tested now, and the live
  bucket proof joins `relevant_notes.md`'s deferred list.

## Capabilities

### New Capabilities
- `job-photos`: capturing, storing, showing, captioning, and deleting a job's photos — the
  tenant-isolated asset (private bucket + signed URLs + RLS row), its `photo` context entry, the
  privacy-preserving client-side preprocessing, and the `photo.uploaded` event that later tools
  trigger from.

### Modified Capabilities
<!-- None. The `photo` context-entry kind already exists in `project-context`, and
     `tool-platform` already specifies that emitting an event with no subscribers is a no-op —
     so this change adds a capability without changing any existing requirement. -->

## Impact

- **New code:** `src/photos/` (the framework/DB-free domain module: accepted content types,
  size limits, storage-key derivation, the upload/delete input shapes); a `PhotoStorageBackend`
  port + memory impl in `src/db/tenant.ts`, its Supabase Storage impl in
  `src/db/photo-storage.ts`, wired in `src/db/session.ts`; migration `0007_*` with the
  hand-appended RLS block; upload/caption/delete server actions and a client uploader
  (canvas downscale + EXIF strip + thumbnail) plus a gallery under
  `app/(app)/projects/[id]/context/`; unit tests (preprocessing rules, storage-key derivation,
  in-memory tenant isolation: cross-tenant read/write/delete blocked, `business_id` stamped from
  the handle, key prefix never taken from input) and an emit test proving `photo.uploaded` is a
  no-op with no subscribers.
- **No new dependency** — `@supabase/supabase-js` is already installed; the browser `canvas`
  API does the resizing.
- **Migration `0007`** — new `project_photos` table; additive, RLS enabled in the same
  migration.
- **Depends on:** `tenancy-foundation` (the `TenantDb` seam + RLS pattern), `project-context`
  (the `photo` entry kind and the job-context surface), `tool-platform` (the dormant trigger
  seam only — nothing is dispatched here).
- **Feeds:** **8b Photo Advisor** (reads a stored photo's bytes, proposes `finding` entries and
  candidate labor/material line items, carries the licensed-professional disclaimer) and **#9
  Code Finder** (subscribes to `photo.uploaded`).
- **Deferred to live infra:** create the private bucket, apply `0007`, prove the storage RLS /
  key-prefix isolation and signed-URL expiry against a real project (`relevant_notes.md`).

## Non-goals

- **No AI, no vision, no tool.** Nothing in this change calls a model, registers a tool, or
  creates a suggestion. Photo Advisor is 8b.
- **No subscriber on `photo.uploaded`.** The event is emitted; `TRIGGERS` stays empty until #9.
- **No server-side image processing** — no `sharp`, no transform service. Resizing and
  thumbnailing happen client-side during the same pass that strips EXIF.
- **No new financial math and no change to the profit signal.** A photo costs nothing and
  changes no estimate; EPH, thresholds, and the roll-up are untouched.
- **No editing, annotating, or drawing on photos**, no albums, no reordering, no video, and no
  offline upload queue.
- **No client-facing photo sharing** — photos stay internal to the tenant; the Client Estimate
  Doc (#10) decides separately what a client ever sees.
