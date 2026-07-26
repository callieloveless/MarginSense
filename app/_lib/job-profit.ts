/**
 * Server-side loader for a project's active-estimate profit state, shared by the job surfaces
 * (constitution §3.5). It resolves the active estimate, its lines, the business's derived
 * rates, and the engine roll-up once, so a persistent profit-signal header and every
 * suggestion's profit preview read the same source. App-layer glue over `src/estimate/` +
 * `src/profit/` (which never import each other, §6.8); no math here.
 */

import { activeVersion, type EstimateComputation } from "@/src/estimate";
import { type BusinessRates } from "@/src/engine";
import { proposedLineItemSchema } from "@/src/context";
import { type EstimateRow, type LineItemRow, type SuggestionRow } from "@/src/db/schema";
import { type TenantDb } from "@/src/db/tenant";
import { businessRates, computeFromRows } from "./estimate-compute";
import { previewLineItemImpact, type LineItemPreview } from "./suggestion-preview";

/** A project's active estimate + the pieces the profit surfaces need. */
export interface JobProfit {
  readonly estimate: EstimateRow;
  readonly lines: LineItemRow[];
  readonly rates: BusinessRates;
  /** The active estimate's engine roll-up, or null when it can't be priced yet. */
  readonly computation: EstimateComputation | null;
}

/** Load the active estimate's profit state, or null when there's no active estimate or no
 * settings yet (the caller shows a "no active estimate" state). A caller that already needs the
 * estimate list (e.g. the hub, which also renders the versions) may pass it — or the promise for it
 * — so the list is read once and shared rather than fetched twice. */
export async function loadJobProfit(
  tenantDb: TenantDb,
  projectId: string,
  estimates?: EstimateRow[] | Promise<EstimateRow[]>,
): Promise<JobProfit | null> {
  const [settings, list] = await Promise.all([
    tenantDb.getSettings(),
    estimates ?? tenantDb.listEstimates(projectId),
  ]);
  const active = activeVersion(list);
  if (!settings || !active) return null;

  const rates = businessRates(settings);
  const lines = await tenantDb.getLineItems(active.id);
  const computed = computeFromRows(active, lines, rates);
  return { estimate: active, lines, rates, computation: computed.ok ? computed.value : null };
}

/**
 * The profit-impact preview for a suggestion, or null when it isn't a line-item suggestion or
 * there's no active estimate to measure against. Keyed only on the suggestion's target/payload.
 */
export function previewForSuggestion(
  suggestion: SuggestionRow,
  job: JobProfit | null,
): LineItemPreview | null {
  if (!job || suggestion.target !== "estimate_line_item") return null;
  const parsed = proposedLineItemSchema.safeParse(suggestion.payload);
  if (!parsed.success) return null;
  return previewLineItemImpact(job.estimate, job.lines, parsed.data, job.rates);
}
