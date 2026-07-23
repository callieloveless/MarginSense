/**
 * The multi-step commits behind a job photo (add-photo-capture), lifted out of the server
 * actions so they can be tested against the in-memory tenant backends — the same shape as
 * `job-profit.ts` and `project-snapshot.ts`, which also take a `TenantDb` rather than a session.
 *
 * A stored photo is two things that must agree: the **asset** (row + objects) and the job's
 * **memory** of it (a `photo` context entry, constitution §4). Storing writes both or neither;
 * deleting removes both, so the shared context never cites bytes that are gone.
 *
 * Failures are reported to the user as one plain sentence, but never silently: each is logged
 * server-side with its underlying cause, because "check your signal" and "the bucket policy
 * rejects writes" are indistinguishable from the outside.
 */

import { type TenantDb } from "@/src/db/tenant";
import { type ContextEntryRow, type ProjectPhotoRow } from "@/src/db/schema";

/** What the caller has already validated: real image bytes of known dimensions. */
export interface StorePhotoInput {
  projectId: string;
  contentType: string;
  bytes: Uint8Array;
  thumbBytes: Uint8Array;
  width: number;
  height: number;
  caption?: string | undefined;
}

export type StorePhotoResult =
  | { ok: true; photo: ProjectPhotoRow }
  | { ok: false; error: string };

/** The message shown for any storage-side failure — plain, phone-first, non-technical. */
const FAILED = "That photo couldn't be saved. Check your signal and try again.";

/**
 * Store the photo and record it in the job's one memory. Returns a typed failure rather than
 * throwing, so the action can render it inline; nothing partial survives a failure.
 */
export async function storePhotoForProject(
  tenantDb: TenantDb,
  input: StorePhotoInput,
): Promise<StorePhotoResult> {
  let photo: ProjectPhotoRow;
  try {
    photo = await tenantDb.addPhoto({
      projectId: input.projectId,
      contentType: input.contentType,
      bytes: input.bytes,
      thumbBytes: input.thumbBytes,
      width: input.width,
      height: input.height,
      ...(input.caption !== undefined && input.caption !== "" ? { caption: input.caption } : {}),
    });
  } catch (err) {
    // addPhoto removed anything it had written before failing.
    console.error(`[photos] storing a photo for project ${input.projectId} failed:`, err);
    return { ok: false, error: FAILED };
  }

  try {
    // Committed directly, not proposed: uploading is a user action, not a tool's suggestion (§5).
    await tenantDb.addContextEntry({
      projectId: input.projectId,
      kind: "photo",
      payload: { storageKey: photo.storageKey },
    });
  } catch (err) {
    console.error(`[photos] recording photo ${photo.id} in the job context failed:`, err);
    await tenantDb.deletePhoto(photo.id).catch((cleanupErr: unknown) => {
      console.error(`[photos] rolling back photo ${photo.id} also failed:`, cleanupErr);
    });
    return { ok: false, error: FAILED };
  }

  return { ok: true, photo };
}

export type DeletePhotoResult = { ok: true; photo: ProjectPhotoRow } | { ok: false; error: string };

/** Entries in `projectId`'s context that point at `storageKey`. Defensive over the JSON blob:
 * a payload that isn't shaped like a photo entry simply doesn't match. */
function entriesForStorageKey(
  entries: readonly ContextEntryRow[],
  storageKey: string,
): ContextEntryRow[] {
  return entries.filter((entry) => {
    if (entry.kind !== "photo") return false;
    const payload = entry.payload as { storageKey?: unknown } | null;
    return payload?.storageKey === storageKey;
  });
}

/**
 * Delete a photo and the job's memory of it: the row, both objects, and every `photo` context
 * entry citing its storage key. Deleting a photo is frequently a *privacy* action — the wrong
 * house, a client who asked — so leaving an entry that names the deleted object would defeat the
 * point, and would hand a later tool a key that resolves to nothing.
 *
 * The entry cleanup runs after the asset is gone and never fails the delete: a stale entry is a
 * cosmetic problem, whereas reporting failure for a photo that *was* deleted would push the user
 * to retry something already done.
 */
export async function deletePhotoForProject(
  tenantDb: TenantDb,
  projectId: string,
  photoId: string,
): Promise<DeletePhotoResult> {
  let photo: ProjectPhotoRow | null;
  try {
    photo = await tenantDb.deletePhoto(photoId);
  } catch (err) {
    console.error(`[photos] deleting photo ${photoId} failed:`, err);
    return { ok: false, error: "That photo couldn't be deleted. Check your signal and try again." };
  }
  if (!photo) return { ok: false, error: "Photo not found." };

  try {
    const entries = await tenantDb.listContextEntries(projectId);
    for (const entry of entriesForStorageKey(entries, photo.storageKey)) {
      await tenantDb.deleteContextEntry(entry.id);
    }
  } catch (err) {
    console.error(`[photos] clearing context entries for photo ${photoId} failed:`, err);
  }

  return { ok: true, photo };
}
