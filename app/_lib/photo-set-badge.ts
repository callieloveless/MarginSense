/**
 * The review badge on a photo set's history card (revamp-photo-advisor), derived from the set's
 * analysis status and its pending-suggestion count — never fabricated. Pure so it can be unit-tested
 * and shared by the history list and the set detail.
 */

import type { PhotoSetAnalysisStatusName } from "@/src/db/schema";

export type SetBadge =
  | { readonly kind: "analyzing" }
  | { readonly kind: "failed" }
  | { readonly kind: "review"; readonly count: number }
  | { readonly kind: "none" };

/**
 * A set's badge: *analyzing…* while its run is in flight, *retry* when the run failed, else *N to
 * review* when it has pending suggestions, else *no action* (found nothing, or all acted on).
 */
export function photoSetBadge(status: PhotoSetAnalysisStatusName, pendingCount: number): SetBadge {
  if (status === "analyzing") return { kind: "analyzing" };
  if (status === "failed") return { kind: "failed" };
  return pendingCount > 0 ? { kind: "review", count: pendingCount } : { kind: "none" };
}

/** A plain, colour-free label for a badge (colour, where used, is paired with this text, §6). */
export function photoSetBadgeLabel(badge: SetBadge): string {
  switch (badge.kind) {
    case "analyzing":
      return "analyzing…";
    case "failed":
      return "analysis didn't finish — retry";
    case "review":
      return `${badge.count} to review`;
    case "none":
      return "No action";
  }
}
