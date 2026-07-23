/**
 * The two-step commit behind storing a job photo (add-photo-capture), lifted out of the server
 * action so it can be tested against the in-memory tenant backends — the same shape as
 * `job-profit.ts` and `project-snapshot.ts`, which also take a `TenantDb` rather than a session.
 *
 * A stored photo is two things that must agree: the **asset** (row + objects) and the job's
 * **memory** of it (a `photo` context entry, constitution §4). `TenantDb.addPhoto` already
 * cleans up its own objects if the row insert fails; this adds the outer half — if the context
 * entry can't be written, the photo is deleted again, so a failed upload leaves no row, no
 * entry, and no stray bytes (design §5).
 */

import { type TenantDb } from "@/src/db/tenant";
import { type ProjectPhotoRow } from "@/src/db/schema";

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
  } catch {
    // addPhoto removed anything it had written before failing.
    return { ok: false, error: FAILED };
  }

  try {
    // Committed directly, not proposed: uploading is a user action, not a tool's suggestion (§5).
    await tenantDb.addContextEntry({
      projectId: input.projectId,
      kind: "photo",
      payload: { storageKey: photo.storageKey },
    });
  } catch {
    await tenantDb.deletePhoto(photo.id).catch(() => {});
    return { ok: false, error: FAILED };
  }

  return { ok: true, photo };
}
