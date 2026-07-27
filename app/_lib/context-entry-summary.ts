/**
 * Plain-language one-liners for a project's typed context entries (constitution §4), shared by the
 * job-memory page and the hub's activity feed so the two can never drift. Presentation glue over
 * the JSON payload — defensive, never trusting the blob's shape. No math and no DB here.
 */

import { formatCents } from "@/src/engine";
import { FINDING_SEVERITY_LABEL, findingSeverityOf } from "@/src/context";
import type { ContextEntryKindName } from "@/src/db/schema";

/** The short word for each entry kind (never colour alone, §6). */
export const KIND_LABEL: Record<ContextEntryKindName, string> = {
  finding: "Finding",
  material: "Material",
  code_ref: "Code",
  photo: "Photo",
  fact: "Fact",
};

/** A one-line description of a context entry's payload (defensive over the JSON blob). */
export function describeEntry(kind: ContextEntryKindName, payload: unknown): string {
  const p = (payload ?? {}) as Record<string, unknown>;
  const s = (v: unknown) => (v == null ? "" : String(v));
  switch (kind) {
    case "finding": {
      // Severity in words (never colour alone, §6); a plain `note` adds nothing worth saying.
      const severity = findingSeverityOf(p);
      const prefix = severity === "note" ? "" : `${FINDING_SEVERITY_LABEL[severity]}: `;
      return `${prefix}${s(p.summary)}`;
    }
    case "material": {
      const price = typeof p.priceCents === "number" ? ` — ${formatCents(p.priceCents)}/${s(p.unit)}` : "";
      return `${s(p.name)}${price}`;
    }
    case "code_ref":
      return `${s(p.code)}: ${s(p.citation)}`;
    case "photo": {
      // A set entry (revamp-photo-advisor) carries a caption/count; a legacy entry, a storage key.
      if (p.setId) {
        const caption = s(p.caption);
        if (caption) return `Photo set: ${caption}`;
        return typeof p.count === "number" ? `Photo set (${p.count} photos)` : "Photo set";
      }
      return `Photo (${s(p.storageKey)})`;
    }
    case "fact":
      return `${s(p.label)}: ${s(p.value)}`;
  }
}
