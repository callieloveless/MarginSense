"use server";

import { revalidatePath } from "next/cache";
import { getServerSession, tenantDbForSession } from "@/src/db/session";
import { resolveModelPort } from "@/src/ai";
import { validateUpload } from "@/src/photos";
import { type TenantDb } from "@/src/db/tenant";
import { type ModelPort } from "@/src/ai";
import { advisePhoto } from "@/app/_lib/photo-advise";
import { storePhotoForProject } from "@/app/_lib/photo-upload";

/**
 * Photo Advisor's actions (add-photo-advisor). Two ways in, because a contractor's day has two
 * shapes:
 *
 * - **run on a photo already on the job** — back at the truck;
 * - **capture and run in one step** — on site: the photo is stored through the same shared commit
 *   any upload uses (so it joins the job normally *and* emits `photo.uploaded` like any other),
 *   then advised on immediately.
 *
 * Both resolve the session **once** and hand an already-resolved tenant handle and model port to
 * `advisePhoto`, which is where the photo → tool wiring lives and where it is tested.
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

/** Everything both actions need, resolved once: the session's tenant handle, a live model port,
 * and a confirmed project. Returns the user-facing reason when any of it isn't available. */
type Ready = { ok: true; tenantDb: TenantDb; port: ModelPort } | { ok: false; error: string };

async function ready(projectId: string): Promise<Ready> {
  const session = await getServerSession();
  if (session.status !== "ready") {
    return { ok: false, error: "Connect Supabase and sign in to use Photo Advisor." };
  }

  // Checked BEFORE any upload happens: vision is the whole tool, so there is no useful no-AI
  // fallback, and storing a photo the user can't get an answer about wastes their signal.
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

  return { ok: true, tenantDb, port: resolution.port };
}

/** Run Photo Advisor on a photo already stored on the job. */
export async function runPhotoAdvisorAction(
  projectId: string,
  photoId: string,
  question: string,
): Promise<AdvisorActionResult> {
  const context = await ready(projectId);
  if (!context.ok) return context;

  const result = await advisePhoto(context.tenantDb, context.port, {
    projectId,
    photoId,
    question,
  });
  if (result.ok) revalidate(projectId);
  return result;
}

/**
 * Store a freshly taken photo and advise on it in one step — the on-site flow. The photo lands on
 * the job exactly as an upload would: same storage path, same `photo` context entry, same
 * `photo.uploaded` event (all of which live in `storePhotoForProject`, so no surface can forget
 * one of them).
 */
export async function capturePhotoAndAdviseAction(
  projectId: string,
  formData: FormData,
): Promise<AdvisorActionResult> {
  const context = await ready(projectId);
  if (!context.ok) return context;

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

  const rawCaption = formData.get("caption");
  const caption = typeof rawCaption === "string" ? rawCaption.trim() : "";

  const stored = await storePhotoForProject(context.tenantDb, {
    projectId,
    contentType: file.type,
    bytes: new Uint8Array(await file.arrayBuffer()),
    thumbBytes: new Uint8Array(await thumb.arrayBuffer()),
    width,
    height,
    caption,
  });
  if (!stored.ok) return { ok: false, error: stored.error };

  const rawQuestion = formData.get("question");
  const question = typeof rawQuestion === "string" ? rawQuestion : "";
  const result = await advisePhoto(context.tenantDb, context.port, {
    projectId,
    photoId: stored.photo.id,
    question,
  });

  // The photo is on the job either way — never imply the upload failed when only the run did.
  revalidate(projectId);
  if (!result.ok) {
    return { ok: false, error: `Photo saved to the job, but the run didn't happen: ${result.error}` };
  }
  return result;
}
