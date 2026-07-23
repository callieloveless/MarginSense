/**
 * How a found or hand-entered material becomes proposed suggestions (add-material-finder). This
 * is the one place the two suggestion shapes are built, so the tool run and the manual-add
 * action stay in lockstep:
 *
 * - A `material` **context entry** (the #5 payload) records the material as a durable fact,
 *   carrying its `sourceUrl` when it has one.
 * - An `estimate_line_item` (`category: "material"`, quantity 1 at the found unit price) targets
 *   the active estimate so its profit-per-hour impact previews (P2) before the user accepts.
 *
 * Search and manual add differ deliberately (see the spec): a **search option** is EITHER a line
 * (when there's an active estimate — so options compare by EPH) OR a context entry (when there
 * isn't); a **hand-added** material is always a context entry, PLUS a line when there's an active
 * estimate. Nothing here commits — every value is a `pending` proposal (§5).
 */

import { type ProposedSuggestion } from "../contract";
import { type ManualMaterial, type MaterialOption } from "./schema";

/** The fields shared by a searched option and a hand-added material. */
interface MaterialFields {
  readonly name: string;
  readonly priceCents: number;
  readonly unit: string;
  readonly supplier?: string | undefined;
  readonly sourceUrl?: string | undefined;
}

/** A `material` context-entry suggestion carrying the material as a fact (with its source). */
export function materialContextSuggestion(m: MaterialFields): ProposedSuggestion {
  // Build the payload without setting optional keys to `undefined` (exactOptionalPropertyTypes).
  const payload: Record<string, unknown> = { name: m.name, priceCents: m.priceCents, unit: m.unit };
  if (m.supplier !== undefined) payload.supplier = m.supplier;
  if (m.sourceUrl !== undefined) payload.sourceUrl = m.sourceUrl;
  return { target: "context_entry", payload: { kind: "material", payload } };
}

/** An `estimate_line_item` suggestion (material, qty 1 at unit price) targeting `estimateId`. */
export function materialLineSuggestion(m: MaterialFields, estimateId: string): ProposedSuggestion {
  return {
    target: "estimate_line_item",
    targetEstimateId: estimateId,
    payload: {
      category: "material",
      description: m.name,
      quantity: 1,
      unitCostCents: m.priceCents,
    },
  };
}

/**
 * Suggestions for one **searched** option: a line item when there's an active estimate (so the
 * comparison is a profit-per-hour comparison), otherwise a single context entry. An option with
 * no `sourceUrl` yields nothing — no unsourced price is ever proposed (§7).
 */
export function searchOptionSuggestions(
  option: MaterialOption,
  activeEstimateId: string | null,
): ProposedSuggestion[] {
  if (option.sourceUrl === undefined || option.sourceUrl === "") return [];
  return activeEstimateId
    ? [materialLineSuggestion(option, activeEstimateId)]
    : [materialContextSuggestion(option)];
}

/**
 * Suggestions for a **hand-added** material: always a context entry, plus a line item when there
 * is an active estimate. No model, no source required — the user is the source.
 */
export function manualMaterialSuggestions(
  material: ManualMaterial,
  activeEstimateId: string | null,
): ProposedSuggestion[] {
  const suggestions: ProposedSuggestion[] = [materialContextSuggestion(material)];
  if (activeEstimateId) suggestions.push(materialLineSuggestion(material, activeEstimateId));
  return suggestions;
}
