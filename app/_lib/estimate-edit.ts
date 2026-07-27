/**
 * Estimate-editing helpers used by the estimate actions, kept session-free so they can be unit-tested
 * against the in-memory tenant backends (constitution §6.3). `duplicateEstimate` is the Option A → B
 * path; `lineSetChanged` is the save-reconciliation check that stops a full-replace save from silently
 * dropping a line added to the estimate after the editor loaded (e.g. an accepted tool suggestion).
 */

import type { EstimateRow } from "@/src/db/schema";
import type { TenantDb } from "@/src/db/tenant";

/**
 * Duplicate an estimate into a NEW inactive version that copies the source's margin, contingency,
 * total-price override, and all line items — including any entered per-line prices. Does not change
 * which version is active and does not seed the project context (that happens only for a project's
 * first estimate). Tenant-scoped via the handle; returns null when the source isn't this business's /
 * project's estimate.
 */
export async function duplicateEstimate(
  tenantDb: TenantDb,
  projectId: string,
  estimateId: string,
): Promise<EstimateRow | null> {
  const source = await tenantDb.getEstimate(estimateId);
  if (!source || source.projectId !== projectId) return null;

  const lines = await tenantDb.getLineItems(estimateId);
  const copy = await tenantDb.createEstimate({
    projectId,
    versionLabel: `Copy of ${source.versionLabel}`,
    targetMarginBp: source.targetMarginBp,
    contingencyBp: source.contingencyBp,
    totalPriceOverrideCents: source.totalPriceOverrideCents,
    isActive: false,
  });

  if (lines.length > 0) {
    await tenantDb.saveLineItems(
      copy.id,
      lines.map((l) => ({
        category: l.category,
        description: l.description,
        laborMinutes: l.laborMinutes,
        quantity: l.quantity,
        unitCostCents: l.unitCostCents,
        priceCents: l.priceCents,
        sortOrder: l.sortOrder,
      })),
    );
  }
  return copy;
}

/**
 * Whether the estimate's line set changed between what the editor loaded (`base`) and what the server
 * has now (`current`) — an id was added or removed meanwhile. Order and edits within a line don't
 * count; only the membership of ids. A save that would full-replace uses this to surface a concurrent
 * change for review rather than silently overwriting it.
 */
export function lineSetChanged(base: readonly string[], current: readonly string[]): boolean {
  if (base.length !== current.length) return true;
  const seen = new Set(base);
  return current.some((id) => !seen.has(id));
}
