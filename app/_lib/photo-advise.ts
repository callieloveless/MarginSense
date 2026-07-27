/**
 * Running Photo Advisor on a posted photo **set** (revamp-photo-advisor), lifted out of the server
 * action so it takes a `TenantDb` and a `ModelPort` and can be tested against the in-memory backends
 * with a mock model.
 *
 * It is the single place the set → tool wiring lives: read the set's images **tenant-scoped**, check
 * the set belongs to the project, and hand the bytes to the tool as validated input. The tool itself
 * never receives a storage handle (§5) — it gets pixels + text and can only answer with `pending`
 * suggestions.
 */

import { MAX_ADVISOR_IMAGES, photoAdvisorTool } from "@/src/tools";
import { type ModelPort } from "@/src/ai";
import { type TenantDb } from "@/src/db/tenant";
import { dispatchAndCompose } from "./compose";

export type AdviseResult =
  | { ok: true; message: string; createdSuggestionIds: readonly string[] }
  | { ok: false; error: string };

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
  return parts.length > 0 ? parts.join(", ") : "nothing conclusive from this set";
}

/**
 * Run Photo Advisor on one of this business's photo sets: read the set's photos tenant-scoped, send
 * them to the tool as one batch of images, and return the run's outcome (including the ids of the
 * suggestions it created, so the caller can tag them with the set). `source: "auto"` — this is the
 * automatic post-set analysis, not a user-opened tool.
 */
export async function adviseSet(
  tenantDb: TenantDb,
  port: ModelPort,
  input: { projectId: string; setId: string; question?: string | undefined },
): Promise<AdviseResult> {
  // Tenant-scoped: another business's set id reads back as null.
  const set = await tenantDb.getPhotoSet(input.setId);
  if (!set || set.projectId !== input.projectId) {
    return { ok: false, error: "That set couldn't be read. Try again." };
  }

  const photos = await tenantDb.listPhotosBySet(input.setId);
  if (photos.length === 0) return { ok: false, error: "This set has no photos to analyze." };

  // Bound the images per request (token cost); the rest of a very large set is simply not sent.
  const capped = photos.slice(0, MAX_ADVISOR_IMAGES);
  const images: { mediaType: string; dataBase64: string }[] = [];
  for (const p of capped) {
    const read = await tenantDb.readPhoto(p.id);
    if (!read) continue; // a photo whose object is missing is skipped, never faked
    images.push({ mediaType: read.contentType, dataBase64: toBase64(read.bytes) });
  }
  if (images.length === 0) return { ok: false, error: "This set's photos couldn't be read." };

  const question = (input.question ?? "").trim();
  try {
    // Through dispatchAndCompose so a registered consumer (Code Finder, R8) can fan out off the
    // findings; with no edge registered this is a plain dispatch.
    const outcome = await dispatchAndCompose(
      {
        toolName: photoAdvisorTool.name,
        projectId: input.projectId,
        input: {
          setId: input.setId,
          images,
          ...(set.caption ? { caption: set.caption } : {}),
          ...(question !== "" ? { question } : {}),
        },
        source: "auto",
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
      createdSuggestionIds: outcome.createdSuggestionIds,
    };
  } catch (err) {
    console.error(`[photo-advisor] run failed for set ${input.setId}:`, err);
    return { ok: false, error: "That run didn't finish. Check your signal and try again." };
  }
}
