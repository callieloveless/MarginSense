/**
 * Running Photo Advisor on a stored photo (add-photo-advisor), lifted out of the server actions
 * so it takes a `TenantDb` and a `ModelPort` — the same shape as `photo-upload.ts` and
 * `job-profit.ts`, and the reason this path can be tested against the in-memory backends with a
 * mock model instead of only through a browser.
 *
 * It is the single place the photo → tool wiring lives: read the image **tenant-scoped**, check
 * it belongs to the project being viewed, and hand the bytes to the tool as validated input. The
 * tool itself never receives a storage handle (constitution §5) — it gets pixels and a question,
 * and can only answer with `pending` suggestions.
 */

import { photoAdvisorTool } from "@/src/tools";
import { type ModelPort } from "@/src/ai";
import { type TenantDb } from "@/src/db/tenant";
import { dispatchAndCompose } from "./compose";

export type AdviseResult = { ok: true; message: string } | { ok: false; error: string };

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
 * Run Photo Advisor on one of this business's photos. `tenantDb` and `port` are already resolved
 * by the caller, so an action that stores a photo and then advises on it does the session work
 * once rather than twice.
 */
export async function advisePhoto(
  tenantDb: TenantDb,
  port: ModelPort,
  input: { projectId: string; photoId: string; question?: string | undefined },
): Promise<AdviseResult> {
  // Tenant-scoped: another business's photo id reads back as null, never as bytes.
  const read = await tenantDb.readPhoto(input.photoId);
  if (!read || read.photo.projectId !== input.projectId) {
    return { ok: false, error: "That photo couldn't be read. Try again, or take a new one." };
  }

  const question = (input.question ?? "").trim();
  try {
    // Through dispatchAndCompose: Photo Advisor's output fans out to any registered consumer
    // (9b wires Code Finder off its findings). With no edge registered this is a plain dispatch.
    const outcome = await dispatchAndCompose(
      {
        toolName: photoAdvisorTool.name,
        projectId: input.projectId,
        input: {
          photoId: read.photo.id,
          storageKey: read.photo.storageKey,
          mediaType: read.contentType,
          imageBase64: toBase64(read.bytes),
          ...(read.photo.caption ? { caption: read.photo.caption } : {}),
          ...(question !== "" ? { question } : {}),
        },
        source: "user",
      },
      { tenantDb, port },
    );
    return {
      ok: true,
      message: `Photo Advisor: ${describeOutcome(
        outcome.createdSuggestionIds.length,
        outcome.skippedDuplicates,
        outcome.messageId !== null,
      )}.`,
    };
  } catch (err) {
    console.error(`[photo-advisor] run failed for photo ${input.photoId}:`, err);
    return { ok: false, error: "That run didn't finish. Check your signal and try again." };
  }
}
