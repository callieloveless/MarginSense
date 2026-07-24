"use server";

import { revalidatePath } from "next/cache";
import { getServerSession, tenantDbForSession } from "@/src/db/session";
import { dispatch, photoAdvisorTool } from "@/src/tools";
import { resolveModelPort } from "@/src/ai";
import { validateUpload } from "@/src/photos";
import { dispatchDeps } from "@/app/_lib/tool-runner";
import { storePhotoForProject } from "@/app/_lib/photo-upload";

/**
 * Photo Advisor's actions (add-photo-advisor). Two ways in, one path out:
 *
 * - **run on a photo already on the job** — the common case back at the truck;
 * - **capture and run in one step** — the on-site case: the photo is stored through the same
 *   path any upload uses (so it joins the job normally) and then advised on immediately.
 *
 * Both resolve the business from the session, read the image **tenant-scoped**, and hand the
 * bytes to the tool as validated input — the tool itself never gets a storage handle (§5).
 * Everything it produces stays a `pending` suggestion until the user accepts it.
 */

export type AdvisorActionResult = { ok: true; message: string } | { ok: false; error: string };

/** Revalidate the surfaces a new pending suggestion shows up on. */
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

/** Base64 for the model port's image input. */
function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

/** A plain sentence describing what a completed run produced. */
function describeOutcome(created: number, duplicates: number, posted: boolean): string {
  const parts = [
    created > 0 ? `${created} suggestion${created === 1 ? "" : "s"} to review` : null,
    duplicates > 0 ? `${duplicates} already waiting` : null,
    posted ? "notes posted to the job" : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : "nothing conclusive from this photo";
}

/**
 * Run Photo Advisor on a photo already stored on the job. Requires a configured model — vision is
 * the whole tool, so there is no useful no-AI fallback (unlike Material Finder's hand-add).
 */
export async function runPhotoAdvisorAction(
  projectId: string,
  photoId: string,
  question: string,
): Promise<AdvisorActionResult> {
  const session = await getServerSession();
  if (session.status !== "ready") {
    return { ok: false, error: "Connect Supabase and sign in to use Photo Advisor." };
  }

  const resolution = resolveModelPort();
  if (resolution.status !== "configured") {
    return { ok: false, error: "Connect AI to have a photo looked at." };
  }

  const tenantDb = tenantDbForSession(session.authUserId, session.businessId);
  if (!tenantDb.hasPhotoStorage) {
    return { ok: false, error: "Photo storage isn't connected yet." };
  }

  const project = await tenantDb.getProject(projectId);
  if (!project) return { ok: false, error: "Project not found." };

  // Tenant-scoped: another business's photo id reads back as null, never as bytes.
  const read = await tenantDb.readPhoto(photoId);
  if (!read || read.photo.projectId !== projectId) {
    return { ok: false, error: "That photo couldn't be read. Try again, or take a new one." };
  }

  const trimmed = question.trim();
  try {
    const outcome = await dispatch(
      {
        toolName: photoAdvisorTool.name,
        projectId,
        input: {
          photoId: read.photo.id,
          storageKey: read.photo.storageKey,
          mediaType: read.contentType,
          imageBase64: toBase64(read.bytes),
          ...(read.photo.caption ? { caption: read.photo.caption } : {}),
          ...(trimmed !== "" ? { question: trimmed } : {}),
        },
        source: "user",
      },
      dispatchDeps(tenantDb, resolution.port),
    );
    revalidate(projectId);
    return {
      ok: true,
      message: `Photo Advisor: ${describeOutcome(
        outcome.createdSuggestionIds.length,
        outcome.skippedDuplicates,
        outcome.messageId !== null,
      )}.`,
    };
  } catch (err) {
    console.error(`[photo-advisor] run failed for photo ${photoId}:`, err);
    return { ok: false, error: "That run didn't finish. Check your signal and try again." };
  }
}

/**
 * Store a freshly taken photo and advise on it in one step — the on-site flow. The photo lands on
 * the job exactly as an upload would (same storage path, same `photo` context entry, same
 * `photo.uploaded` event is *not* re-emitted here: `storePhotoForProject` is the shared commit,
 * and the advisor run is what follows).
 */
export async function capturePhotoAndAdviseAction(
  projectId: string,
  formData: FormData,
): Promise<AdvisorActionResult> {
  const session = await getServerSession();
  if (session.status !== "ready") {
    return { ok: false, error: "Connect Supabase and sign in to use Photo Advisor." };
  }

  const file = formData.get("photo");
  const thumb = formData.get("thumb");
  if (!(file instanceof File) || !(thumb instanceof File)) {
    return { ok: false, error: "Take or choose a photo first." };
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

  // The photo is on the job either way — if the model isn't configured, say so without
  // pretending the upload failed.
  const rawQuestion = formData.get("question");
  const question = typeof rawQuestion === "string" ? rawQuestion : "";
  const run = await runPhotoAdvisorAction(projectId, stored.photo.id, question);
  if (!run.ok) {
    revalidate(projectId);
    return { ok: false, error: `Photo saved to the job, but the run didn't happen: ${run.error}` };
  }
  return run;
}
