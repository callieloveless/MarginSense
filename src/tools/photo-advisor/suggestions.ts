/**
 * How a vision result becomes proposals (add-photo-advisor) — the one place the mapping lives, so
 * the rules are readable in a single file rather than inferred from a prompt.
 *
 * Two rules do the real work:
 *
 * 1. **A finding becomes a `finding` context entry** carrying its severity and the storage key of
 *    the photo behind it, so the job's memory records how serious a diagnosis is and which
 *    picture produced it (§6.6).
 * 2. **Only labor becomes a line item.** Materials are named inside the finding and never
 *    proposed as lines: Photo Advisor cannot source a price (§7), and an uncosted material line
 *    rolls up as *zero*, so one accepted and forgotten would leave the estimate overstating
 *    profit and the signal green when it should be yellow. Material Finder prices what the photo
 *    found; this tool doesn't guess.
 *
 * A labor line carries **minutes only** — its cost is the engine's, from the business's own
 * burdened rate. Nothing here commits; every value is a `pending` proposal (§5).
 */

import { type ProposedSuggestion } from "../contract";
import { type VisionFinding, type VisionLabor } from "./schema";

/**
 * Beyond this, a single repair task's estimate stops being plausible from one photograph (~2
 * working weeks). It does **not** filter anything: an out-of-range candidate is still proposed
 * with the minutes the model gave, and is called out in the conversation post instead. If the
 * repair really is that big, that is the most valuable thing the photo can say about this job.
 */
export const IMPLAUSIBLE_LABOR_MINUTES = 4800;

/** True when a labor estimate is large enough to be worth questioning out loud. */
export function isImplausibleEstimate(labor: VisionLabor): boolean {
  return labor.laborMinutes > IMPLAUSIBLE_LABOR_MINUTES;
}

/**
 * A finding → its `finding` context-entry suggestion. Materials the repair needs are folded into
 * the entry's detail text (they are part of the diagnosis), never into a priced line.
 */
export function findingSuggestion(finding: VisionFinding, storageKey: string): ProposedSuggestion {
  const materials = finding.materials ?? [];
  const detailParts = [
    finding.detail,
    materials.length > 0 ? `Materials needed: ${materials.join(", ")}.` : undefined,
  ].filter((part): part is string => part !== undefined && part !== "");

  // Build without setting optional keys to `undefined` (exactOptionalPropertyTypes).
  const payload: Record<string, unknown> = {
    summary: finding.summary,
    severity: finding.severity,
    photoStorageKey: storageKey,
  };
  if (detailParts.length > 0) payload.detail = detailParts.join(" ");

  return { target: "context_entry", payload: { kind: "finding", payload } };
}

/**
 * A labor candidate → an `estimate_line_item` targeting the active estimate. Returns nothing when
 * the project has no active estimate: a line-item suggestion with no estimate to land in is
 * invalid by change #5's own rules, so the tool says so in its post instead of proposing rubbish.
 */
export function laborSuggestion(
  labor: VisionLabor,
  activeEstimateId: string | null,
): ProposedSuggestion[] {
  if (!activeEstimateId) return [];
  return [
    {
      target: "estimate_line_item",
      targetEstimateId: activeEstimateId,
      payload: {
        category: "labor",
        description: labor.description,
        // The model's minutes, unchanged. Cost comes from the engine's burdened rate (§3.4).
        laborMinutes: labor.laborMinutes,
      },
    },
  ];
}

/** Every material named across a result's findings, de-duplicated, for the Material Finder
 * handoff in the conversation post. */
export function materialsNamed(findings: readonly VisionFinding[]): string[] {
  const seen = new Set<string>();
  for (const finding of findings) {
    for (const material of finding.materials ?? []) {
      const trimmed = material.trim();
      if (trimmed !== "") seen.add(trimmed);
    }
  }
  return [...seen];
}
