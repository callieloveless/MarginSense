"use server";

/**
 * Photo-set actions (revamp-photo-advisor). Posting a set is an **outer-layer user action** — the
 * business is resolved from the session, every photo is re-validated server-side (a client can lie),
 * and the set commits with no model call. Analysis is a separate, best-effort step the client kicks
 * after this returns (so a bad connection never blocks the post).
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getServerSession, tenantDbForSession } from "@/src/db/session";
import { validateUpload } from "@/src/photos";
import { resolveModelPort } from "@/src/ai";
import { adviseSet } from "@/app/_lib/photo-advise";
import {
  deletePhotoSetForProject,
  postPhotoSetForProject,
  type SetPhotoInput,
} from "@/app/_lib/photo-set-post";

export type PhotoSetActionResult = { ok: true; setId: string } | { ok: false; error: string };

function revalidate(projectId: string): void {
  revalidatePath(`/projects/${projectId}/photos`);
  revalidatePath(`/projects/${projectId}`);
}

/** Post a captioned set of prepared photos. The client sends one `caption` plus repeated
 * `photo`/`thumb`/`width`/`height` fields, one group per photo. */
export async function postPhotoSetAction(
  projectId: string,
  formData: FormData,
): Promise<PhotoSetActionResult> {
  const session = await getServerSession();
  if (session.status !== "ready") {
    return { ok: false, error: "Connect Supabase and sign in to post photos." };
  }
  const tenantDb = tenantDbForSession(session.authUserId, session.businessId);
  if (!tenantDb.hasPhotoStorage) {
    return { ok: false, error: "Photo storage isn't connected yet, so photos can't be saved." };
  }
  const project = await tenantDb.getProject(projectId);
  if (!project) return { ok: false, error: "Project not found." };

  const files = formData.getAll("photo");
  const thumbs = formData.getAll("thumb");
  const widths = formData.getAll("width");
  const heights = formData.getAll("height");
  if (files.length === 0) return { ok: false, error: "Add at least one photo to the set." };
  if (files.length !== thumbs.length || files.length !== widths.length || files.length !== heights.length) {
    return { ok: false, error: "That set couldn't be read. Try again." };
  }

  const prepared: SetPhotoInput[] = [];
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const thumb = thumbs[i];
    if (!(file instanceof File) || !(thumb instanceof File)) {
      return { ok: false, error: "Choose photos to post." };
    }
    const width = Number(widths[i]);
    const height = Number(heights[i]);
    if (!Number.isInteger(width) || width <= 0 || !Number.isInteger(height) || height <= 0) {
      return { ok: false, error: "A photo couldn't be read. Try taking it again." };
    }
    const check = validateUpload({ contentType: file.type, byteSize: file.size });
    if (!check.ok) return { ok: false, error: check.error };
    const thumbCheck = validateUpload({ contentType: thumb.type, byteSize: thumb.size });
    if (!thumbCheck.ok) return { ok: false, error: thumbCheck.error };
    prepared.push({
      contentType: file.type,
      bytes: new Uint8Array(await file.arrayBuffer()),
      thumbBytes: new Uint8Array(await thumb.arrayBuffer()),
      width,
      height,
    });
  }

  const rawCaption = formData.get("caption");
  const caption = typeof rawCaption === "string" ? rawCaption : "";

  const result = await postPhotoSetForProject(tenantDb, { projectId, caption, photos: prepared });
  if (!result.ok) return { ok: false, error: result.error };

  revalidate(projectId);
  return { ok: true, setId: result.set.id };
}

export type AnalyzeResult = { ok: boolean; aiUnconfigured?: boolean };

/**
 * Run Photo Advisor on a set (revamp-photo-advisor) — auto-kicked by the client right after a post,
 * and again on Retry. Best-effort and idempotent: it moves the set's status to done/failed, tags the
 * suggestions it created with the set, and never re-posts the photos. A failed or unconfigured run
 * leaves the set posted and retryable.
 */
export async function analyzeSetAction(projectId: string, setId: string): Promise<AnalyzeResult> {
  const session = await getServerSession();
  if (session.status !== "ready") return { ok: false };
  const tenantDb = tenantDbForSession(session.authUserId, session.businessId);

  const resolution = resolveModelPort();
  if (resolution.status !== "configured") {
    await tenantDb.setPhotoSetStatus(setId, "failed");
    revalidate(projectId);
    return { ok: false, aiUnconfigured: true };
  }

  const result = await adviseSet(tenantDb, resolution.port, { projectId, setId });
  if (result.ok) {
    if (result.createdSuggestionIds.length > 0) {
      await tenantDb.tagSuggestionsWithSet(result.createdSuggestionIds, setId);
    }
    await tenantDb.setPhotoSetStatus(setId, "done");
  } else {
    await tenantDb.setPhotoSetStatus(setId, "failed");
  }
  revalidate(projectId);
  revalidatePath(`/projects/${projectId}/photos/${setId}`);
  return { ok: result.ok };
}

/** Delete a set (its photos, objects, and the `photo` context entry), then return to the history. */
export async function deleteSetAction(projectId: string, setId: string): Promise<void> {
  const session = await getServerSession();
  if (session.status !== "ready") return;
  const tenantDb = tenantDbForSession(session.authUserId, session.businessId);
  await deletePhotoSetForProject(tenantDb, projectId, setId);
  revalidate(projectId);
  redirect(`/projects/${projectId}/photos`);
}
