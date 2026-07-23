"use server";

import { revalidatePath } from "next/cache";
import { getServerSession, tenantDbForSession } from "@/src/db/session";
import { type TenantDb } from "@/src/db/tenant";
import { validateUpload } from "@/src/photos";
import { emit } from "@/src/tools";
import { resolveModelPort } from "@/src/ai";
import { dispatchDeps } from "@/app/_lib/tool-runner";
import { storePhotoForProject } from "@/app/_lib/photo-upload";

/**
 * Job-photo actions (add-photo-capture). Uploading a photo is an **outer-layer user action**,
 * not a tool run: the business is resolved from the session, the bytes are validated again on
 * the server (a client can always lie), and the result is committed directly — a `photo` row
 * plus a `photo` context entry authored by the user. Nothing here creates a suggestion, calls a
 * model, or records a `tool_run`; the vision tool is 8b.
 *
 * A successful upload emits `photo.uploaded` through the platform's dormant trigger seam, so #9
 * can subscribe Code Finder with a registry entry instead of a rewiring — and the emit is
 * wrapped so a future subscriber's failure can never fail an upload that already succeeded.
 */

export type PhotoActionResult = { ok: true; message: string } | { ok: false; error: string };

/** Revalidate the surfaces a photo shows up on. */
function revalidate(projectId: string): void {
  revalidatePath(`/projects/${projectId}/context`);
  revalidatePath(`/projects/${projectId}/tools`);
}

/** Read an integer form field, or null when it isn't one. */
function intField(formData: FormData, name: string): number | null {
  const raw = formData.get(name);
  if (typeof raw !== "string") return null;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/**
 * Emit `photo.uploaded` for a stored photo. With `TRIGGERS` empty this dispatches nothing (the
 * tool-platform spec: an event with no subscribers is a no-op); the deps are built with the
 * **resolved** model port so a subscriber added in #9 reaches a live model rather than the mock.
 * Failures are swallowed: the photo is already stored, and an auto-trigger is never allowed to
 * turn a successful upload into an error.
 */
async function emitPhotoUploaded(
  tenantDb: TenantDb,
  input: { projectId: string; photoId: string; storageKey: string },
): Promise<void> {
  try {
    const resolution = resolveModelPort();
    const deps =
      resolution.status === "configured"
        ? dispatchDeps(tenantDb, resolution.port)
        : dispatchDeps(tenantDb);
    await emit("photo.uploaded", { projectId: input.projectId, input }, deps);
  } catch {
    // Deliberately ignored — see the doc comment.
  }
}

/**
 * Store a job photo. The client has already downscaled it and re-encoded it (which drops
 * EXIF/GPS — constitution §7); this validates what actually arrived, writes the objects and the
 * row through the tenant handle (which stamps `business_id` and derives the storage key), then
 * records the photo in the job's one memory as a `photo` context entry.
 *
 * If the context entry can't be written, the photo is deleted again — a half-finished upload
 * leaves neither a row, an entry, nor stray bytes.
 */
export async function uploadPhotoAction(
  projectId: string,
  formData: FormData,
): Promise<PhotoActionResult> {
  const session = await getServerSession();
  if (session.status !== "ready") {
    return { ok: false, error: "Connect Supabase and sign in to add a photo." };
  }

  const file = formData.get("photo");
  const thumb = formData.get("thumb");
  if (!(file instanceof File) || !(thumb instanceof File)) {
    return { ok: false, error: "Choose a photo to upload." };
  }

  const width = intField(formData, "width");
  const height = intField(formData, "height");
  if (width === null || height === null) {
    return { ok: false, error: "That photo couldn't be read. Try taking it again." };
  }

  // Re-validate server-side: the client resizer is a courtesy, not a control.
  const check = validateUpload({ contentType: file.type, byteSize: file.size });
  if (!check.ok) return { ok: false, error: check.error };
  const thumbCheck = validateUpload({ contentType: thumb.type, byteSize: thumb.size });
  if (!thumbCheck.ok) return { ok: false, error: thumbCheck.error };

  const tenantDb = tenantDbForSession(session.authUserId, session.businessId);
  if (!tenantDb.hasPhotoStorage) {
    return { ok: false, error: "Photo storage isn't connected yet, so photos can't be saved." };
  }

  const project = await tenantDb.getProject(projectId);
  if (!project) return { ok: false, error: "Project not found." };

  const rawCaption = formData.get("caption");
  const caption = typeof rawCaption === "string" ? rawCaption.trim() : "";

  // The asset and the job's memory of it commit together, or not at all (see photo-upload.ts).
  const stored = await storePhotoForProject(tenantDb, {
    projectId,
    contentType: file.type,
    bytes: new Uint8Array(await file.arrayBuffer()),
    thumbBytes: new Uint8Array(await thumb.arrayBuffer()),
    width,
    height,
    caption,
  });
  if (!stored.ok) return { ok: false, error: stored.error };

  await emitPhotoUploaded(tenantDb, {
    projectId,
    photoId: stored.photo.id,
    storageKey: stored.photo.storageKey,
  });

  revalidate(projectId);
  return { ok: true, message: "Photo added to this job." };
}

/** Set or clear a photo's caption, tenant-scoped. */
export async function setPhotoCaptionAction(
  projectId: string,
  photoId: string,
  formData: FormData,
): Promise<PhotoActionResult> {
  const session = await getServerSession();
  if (session.status !== "ready") {
    return { ok: false, error: "Connect Supabase and sign in to edit a photo." };
  }
  const raw = formData.get("caption");
  const caption = typeof raw === "string" ? raw.trim() : "";

  const tenantDb = tenantDbForSession(session.authUserId, session.businessId);
  const updated = await tenantDb.setPhotoCaption(photoId, caption === "" ? null : caption);
  if (!updated) return { ok: false, error: "Photo not found." };

  revalidate(projectId);
  return { ok: true, message: caption === "" ? "Caption removed." : "Caption saved." };
}

/** Delete a photo — its objects and its row, tenant-scoped. The `photo` context entry stays as
 * the job's record that a photo was taken; it is a fact of the job's history, not the asset. */
export async function deletePhotoAction(
  projectId: string,
  photoId: string,
): Promise<PhotoActionResult> {
  const session = await getServerSession();
  if (session.status !== "ready") {
    return { ok: false, error: "Connect Supabase and sign in to delete a photo." };
  }

  const tenantDb = tenantDbForSession(session.authUserId, session.businessId);
  if (!tenantDb.hasPhotoStorage) {
    return { ok: false, error: "Photo storage isn't connected yet." };
  }

  const deleted = await tenantDb.deletePhoto(photoId);
  if (!deleted) return { ok: false, error: "Photo not found." };

  revalidate(projectId);
  return { ok: true, message: "Photo deleted." };
}
