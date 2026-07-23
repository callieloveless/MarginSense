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
 * A material — searched or hand-added — is always proposed as a `material` **context entry**
 * (which carries name, price, unit, supplier, AND source, per the spec) and, when there's an
 * active estimate, ALSO as an `estimate_line_item` so its profit-per-hour impact previews (P2).
 * The two are the same shape; only the source rule differs — a searched option needs a valid
 * source URL (§7: never propose a price it cannot source), a hand-added one does not (the user
 * is the source). Nothing here commits — every value is a `pending` proposal (§5).
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

/** True when `s` is a usable http(s) source URL — a non-URL string (e.g. "see catalog") is not a
 * source (§7), so it must not qualify an option as sourced. */
export function isSourceUrl(s: string | undefined): s is string {
  if (s === undefined || s === "") return false;
  try {
    const u = new URL(s);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

/** A material → its suggestions: a context entry always, plus a line item when there's an active
 * estimate. The single shape both searched and hand-added materials share. */
function materialSuggestions(m: MaterialFields, activeEstimateId: string | null): ProposedSuggestion[] {
  const out: ProposedSuggestion[] = [materialContextSuggestion(m)];
  if (activeEstimateId) out.push(materialLineSuggestion(m, activeEstimateId));
  return out;
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
 * Suggestions for one **searched** option: the shared material shape (context entry carrying the
 * source, plus a line item when there's an active estimate). An option without a valid source URL
 * yields nothing — no unsourced price is ever proposed (§7).
 */
export function searchOptionSuggestions(
  option: MaterialOption,
  activeEstimateId: string | null,
): ProposedSuggestion[] {
  if (!isSourceUrl(option.sourceUrl)) return [];
  return materialSuggestions(option, activeEstimateId);
}

/**
 * Suggestions for a **hand-added** material: the same shared shape. No model, no source required
 * — the user is the source.
 */
export function manualMaterialSuggestions(
  material: ManualMaterial,
  activeEstimateId: string | null,
): ProposedSuggestion[] {
  return materialSuggestions(material, activeEstimateId);
}
