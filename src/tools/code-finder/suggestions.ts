/**
 * How a found code becomes a proposal (add-code-finder) — one place, so the tool and any future
 * caller stay in lockstep.
 *
 * A code → a `code_ref` **context-entry** suggestion carrying the code, the requirement, its
 * jurisdiction, its source, its compliance note, and (on a composed run) the photo it came from.
 * A code with no real source URL yields nothing — the app never proposes a citation it cannot
 * source (§7), the same rule Material Finder applies to prices. The result set is capped so a
 * broad question can't flood a phone queue. Nothing here is a line item: a code is a fact, and an
 * unpriced permit line would understate the job's cost. Nothing commits — every value is a
 * `pending` proposal (§5).
 */

import { isSourceUrl } from "../material-finder";
import { type ProposedSuggestion } from "../contract";
import { type CodeResultItem } from "./schema";

/** At most this many code references per run — a focused answer, not an exhaustive citation dump
 * that buries the review queue on a phone. */
export const MAX_CODE_RESULTS = 4;

/** The sourced codes a run will actually propose: those with a real source URL, capped. */
export function sourcedCodes(codes: readonly CodeResultItem[]): CodeResultItem[] {
  return codes.filter((c) => isSourceUrl(c.sourceUrl)).slice(0, MAX_CODE_RESULTS);
}

/** A sourced code → its `code_ref` suggestion. Optional keys are set only when present
 * (exactOptionalPropertyTypes). Assumes `code.sourceUrl` is already known good (see
 * {@link sourcedCodes}). */
export function codeSuggestion(
  code: CodeResultItem,
  photoStorageKey: string | undefined,
): ProposedSuggestion {
  const payload: Record<string, unknown> = { code: code.code, citation: code.requirement };
  if (code.jurisdiction !== undefined) payload.jurisdiction = code.jurisdiction;
  if (code.sourceUrl !== undefined) payload.sourceUrl = code.sourceUrl;
  if (code.complianceNote !== undefined) payload.complianceNote = code.complianceNote;
  if (photoStorageKey !== undefined) payload.photoStorageKey = photoStorageKey;
  return { target: "context_entry", payload: { kind: "code_ref", payload } };
}
