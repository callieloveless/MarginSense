/**
 * Posting a photo set (revamp-photo-advisor), lifted out of the server action so it can be tested
 * against the in-memory tenant backends. A set is the asset (its `photo_sets` row + each photo's
 * row and objects) plus the job's **memory** of it (one `photo` context entry referencing the set).
 * Posting writes them together or rolls back — and it **never calls the model**: analysis is a
 * separate, best-effort step the client kicks afterward, so a bad connection never blocks the post.
 */

import { type TenantDb } from "@/src/db/tenant";
import { type ContextEntryRow, type PhotoSetRow } from "@/src/db/schema";

/** One prepared photo the caller has already downscaled + validated. */
export interface SetPhotoInput {
  contentType: string;
  bytes: Uint8Array;
  thumbBytes: Uint8Array;
  width: number;
  height: number;
}

export type PostSetResult = { ok: true; set: PhotoSetRow } | { ok: false; error: string };

const FAILED = "That set couldn't be saved. Check your signal and try again.";

/**
 * Create the set, store each photo against it, and record it in the job's one memory as a single
 * `photo` context entry (referencing the set, not a loose photo). If any step fails, the set and its
 * photos — objects included — are removed, so a half-posted set leaves nothing behind.
 */
export async function postPhotoSetForProject(
  tenantDb: TenantDb,
  input: { projectId: string; caption?: string | undefined; photos: readonly SetPhotoInput[] },
): Promise<PostSetResult> {
  if (input.photos.length === 0) return { ok: false, error: "Add at least one photo to the set." };

  const caption = input.caption?.trim() ? input.caption.trim() : null;
  const set = await tenantDb.createPhotoSet({ projectId: input.projectId, caption });

  try {
    let coverKey: string | null = null;
    for (const p of input.photos) {
      const photo = await tenantDb.addPhoto({
        projectId: input.projectId,
        contentType: p.contentType,
        bytes: p.bytes,
        thumbBytes: p.thumbBytes,
        width: p.width,
        height: p.height,
        setId: set.id,
      });
      coverKey ??= photo.storageKey;
    }
    // Committed directly, not proposed: posting a set is a user action, not a suggestion (§4/§5).
    await tenantDb.addContextEntry({
      projectId: input.projectId,
      kind: "photo",
      payload: { setId: set.id, caption, count: input.photos.length, coverKey },
    });
  } catch (err) {
    console.error(`[photo-sets] posting a set for project ${input.projectId} failed:`, err);
    // Removes the set row (cascading its photo rows) and every stored object first.
    await tenantDb.deletePhotoSet(set.id).catch((cleanupErr: unknown) => {
      console.error(`[photo-sets] rolling back set ${set.id} also failed:`, cleanupErr);
    });
    return { ok: false, error: FAILED };
  }

  return { ok: true, set };
}

export type DeleteSetResult = { ok: true } | { ok: false; error: string };

/** The `photo` context entries that reference a given set (defensive over the JSON payload). */
function entriesForSet(entries: readonly ContextEntryRow[], setId: string): ContextEntryRow[] {
  return entries.filter((e) => {
    if (e.kind !== "photo") return false;
    const payload = e.payload as { setId?: unknown } | null;
    return payload?.setId === setId;
  });
}

/**
 * Delete a set: its photos' objects and rows and the set row, then the `photo` context entry that
 * named it — so the job's memory never cites a set that's gone. The entry cleanup runs after the
 * asset is gone and never fails the delete (a stale entry is cosmetic; a failed report on a set that
 * *was* deleted would push a pointless retry).
 */
export async function deletePhotoSetForProject(
  tenantDb: TenantDb,
  projectId: string,
  setId: string,
): Promise<DeleteSetResult> {
  let removed;
  try {
    removed = await tenantDb.deletePhotoSet(setId);
  } catch (err) {
    console.error(`[photo-sets] deleting set ${setId} failed:`, err);
    return { ok: false, error: "That set couldn't be deleted. Check your signal and try again." };
  }
  if (!removed) return { ok: false, error: "Set not found." };

  try {
    const entries = await tenantDb.listContextEntries(projectId);
    for (const entry of entriesForSet(entries, setId)) {
      await tenantDb.deleteContextEntry(entry.id);
    }
  } catch (err) {
    console.error(`[photo-sets] clearing context entries for set ${setId} failed:`, err);
  }

  return { ok: true };
}
