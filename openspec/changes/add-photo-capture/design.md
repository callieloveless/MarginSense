## Context

The shared context (change #5) already defines a `photo` entry kind whose payload is
`{ storageKey, annotations? }` — a pointer to bytes that have never had anywhere to live. The
tenant seam (`src/db/tenant.ts`) and its RLS pattern are mature: five capabilities now add an
`XBackend` port with a memory impl (isolation tests) and a Drizzle impl inside
`withAuthenticatedTx`. The tool platform's trigger seam (`src/tools/triggers.ts`) is deliberately
dormant — `TRIGGERS = {}` — waiting for exactly this change to emit `photo.uploaded`.

What is new here is a kind of data the app has never handled: **binary objects**, which live
outside Postgres and therefore outside the RLS guarantee we lean on everywhere else. That, plus
the fact that job photos are pictures of people's homes (constitution §7), is what shapes the
decisions below.

Assumed constraints: Supabase Storage (techstack §1), no live Supabase project yet, phone-first
capture, no server-side image processing budget, and the existing rule that all tenant data
access goes through a handle that stamps `business_id` itself.

## Goals / Non-Goals

**Goals:**
- A job photo is as tenant-isolated as any row: `business_id` on the record, RLS on the table,
  **and** a database-enforced policy on the object itself — not just a UI filter.
- Nothing about a photo requires AI. The whole capability is provable offline against the memory
  backend, exactly like every prior change.
- Location metadata never leaves the phone.
- Provide 8b and #9 with what they need — a stable photo identity, its bytes on demand, and a
  real `photo.uploaded` event — while building neither.

**Non-Goals:**
- Vision, findings, suggestions, tool registration, or a `TRIGGERS` subscriber (8b / #9).
- Server-side image processing, format conversion beyond the client's JPEG re-encode, or
  transformations at read time.
- Any change to the financial model, the estimate, or the profit signal.

## Decisions

### 1. Storage is a `PhotoStorageBackend` on the `TenantDb` seam, not a free-standing module
The port takes `businessId` on every method (`putObject`, `signedUrl`, `deleteObject`) and
`TenantDb` supplies its own bound id, so feature code never holds an unscoped storage handle —
the same shape as `ContextBackend` and `ToolRunsBackend`. A **memory impl** (a `Map` of key →
bytes shared across tenants, mirroring how the memory row backends hold every tenant's rows)
lets the isolation tests prove cross-tenant reads and deletes are refused without any network.

*Alternative considered:* a standalone `src/storage/` module with its own auth. Rejected — it
would be the only tenant-scoped data path in the codebase that isn't the seam, and reviewers
would have to verify a second isolation story.

### 2. Two enforcement layers on the object: a derived key prefix **and** a `storage.objects` policy
The key is `"{business_id}/{project_id}/{photo_id}.jpg"` (thumbnail: `…/{photo_id}_thumb.jpg`),
derived server-side in a pure function in `src/photos/`. The `business_id` segment comes from the
tenant handle, never from input, so a caller cannot address another tenant's prefix. That alone
is app-layer, so migration `0007` also hand-appends a policy on `storage.objects` for the bucket:

```sql
(storage.foldername(name))[1] = public.current_business_id()::text
```

`public.current_business_id()` already exists (migration `0000`, `SECURITY DEFINER`), and the
app reaches Storage through the **session-scoped SSR client** (anon key + the user's JWT), so
`auth.uid()` resolves and the policy actually applies. We deliberately do **not** use the
service-role key, which would bypass storage RLS and put the whole guarantee back in app code.

*Trade-off:* creating the bucket and its policies is a live-infra step. The SQL ships in `0007`
guarded to be idempotent, and creating the bucket lands on the deferred list; if a hosted
environment refuses the `storage.objects` policy to the migration role, the fallback is applying
it from the Supabase SQL editor — the app-layer prefix rule holds either way.

### 3. The client prepares the image; the server never processes pixels
A client component draws the picked file into a `<canvas>`, scales the long edge to ≤1568px
(the model's effective vision resolution, so 8b gains nothing from more), and re-encodes to
JPEG. Canvas re-encoding **discards EXIF as a side effect** — the privacy win is free and does
not depend on a metadata-stripping library. The same pass emits a ~400px thumbnail, so the
gallery never downloads full-size images.

*Alternative considered:* `sharp` server-side (a heavy dependency, slow cold starts on Vercel,
and the full-resolution original with its GPS tag still travels over the wire) or Supabase image
transformations (plan-gated, and still uploads the original). Both rejected: the point is that
the untouched original never leaves the device.

### 4. Upload posts to a server action, with the body limit raised deliberately
Next's server actions default to a **1 MB** body limit — smaller than a downscaled photo plus its
thumbnail. `next.config.mjs` sets `experimental.serverActions.bodySizeLimit` to a value above the
enforced maximum upload size, and the server re-validates content type and byte size regardless
(a client can always lie). A server action, rather than a route handler, keeps session
resolution and `revalidatePath` on the well-trodden path every other write in this app uses.

### 5. Objects are written before the row, with best-effort cleanup
Order: generate the photo id → write both objects → insert the row → add the `photo` context
entry → emit. If any step after the object write fails, the action deletes the objects it wrote
and reports failure. This satisfies "a failed write leaves no orphan **row**"; the residue it can
leave is an orphan **object**, which is invisible to the user, costs pennies, and cannot leak
(it sits under the tenant's own policy-protected prefix). The reverse order — row first — would
leave a photo record pointing at nothing, which the gallery would have to render as a broken
tile.

### 6. The context entry keeps the existing payload; the storage key carries identity
The `photo` payload stays `{ storageKey, annotations? }`, unchanged from change #5, and the
storage key embeds the photo id — so no `project-context` requirement moves, and 8b can resolve
an entry back to its row. Findings-referencing-a-photo is 8b's problem to specify if it needs
more.

### 7. The upload emits through the platform seam, resolving the real model port
The action calls `emit("photo.uploaded", { projectId, input: { photoId, storageKey, projectId } },
deps)` with deps built over the tenant handle and the **resolved** model port (falling back to
the mock when unconfigured). With `TRIGGERS` empty this loops zero times, but it means #9's only
change is one registry entry — not a rewiring of how the auto-run reaches a live model. The emit
is wrapped so a subscriber's failure can never fail an upload that already succeeded.

### 8. Unconfigured storage is a first-class state
`resolvePhotoStorage()` returns `{ status: "configured", backend } | { status: "unconfigured" }`,
mirroring `resolveModelPort()`. The gallery renders a plain "connect storage" panel and the
uploader is disabled — the same posture the app already takes without Supabase or without an
Anthropic key, so nothing in this change blocks on infrastructure that doesn't exist yet.

## Risks / Trade-offs

- **Storage RLS is unproven until a bucket exists** → the app-layer prefix derivation is unit
  tested and the memory backend proves cross-tenant refusal; the policy itself joins the
  `relevant_notes.md` deferred list beside the other unproven RLS tables, with an explicit
  "prove a signed URL from business A cannot read business B's object" item.
- **Signed URLs are bearer links for their lifetime** → issue them short-lived (~60s) and only
  for the requesting tenant's own rows; never render a public URL, never persist a signed URL.
- **Client-side downscaling is defeatable** → a hostile client can post anything, so the server
  independently enforces content type and size caps; the worst case is a stored image with EXIF
  intact, not a tenancy or availability failure.
- **HEIC from iOS** → Safari's file input generally hands over JPEG, but a HEIC that slips
  through fails to decode into the canvas; the uploader reports "that image format isn't
  supported — try again with JPEG or PNG" rather than uploading something the model can't read.
- **Orphan objects on a partial failure** → bounded, invisible, and tenant-scoped; a sweep job is
  deferred rather than built.
- **Photos raise the tenant's data sensitivity** → delete is v1 (not deferred) precisely so a
  wrong-house photo is correctable, and no photo is ever exposed outside the tenant in this
  change.

## Migration Plan

1. `npm run db:generate` produces `0007_*` for `project_photos`; hand-append the RLS block
   (enable RLS, per-business policy on `public.current_business_id()`, `GRANT … TO
   authenticated`) mirroring `0000`, plus the idempotent bucket + `storage.objects` policy block.
2. Ship behind the unconfigured state: with no bucket, the surface degrades and nothing breaks.
3. Live-infra steps (deferred, added to `relevant_notes.md`): create the private bucket, apply
   `0007`, prove cross-tenant object access is refused, and confirm signed-URL expiry.
4. Rollback: the change is additive — dropping the table and the bucket removes the capability
   with no effect on estimates, context entries, or the profit signal.

## Open Questions

- Should a job photo eventually be attachable to a specific line item or finding (a "this is
  what the $1,800 is for" link)? Not needed for 8b; revisit when the Client Estimate Doc (#10)
  decides what a client sees.
- Is a retention/cleanup policy for orphaned objects worth building before launch, or is it a
  hardening-pass item (#11)? Currently assumed to be #11.
