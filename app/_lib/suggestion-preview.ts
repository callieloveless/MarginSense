/**
 * The profit-impact preview for a line-item suggestion (add-suggestion-preview). Given a
 * project's active estimate and a proposed line, it computes — through the pure engine — the
 * estimate's profit-per-hour and red/yellow/green signal as they are now and as they would be
 * if the line were added, so a suggestion can be accepted with its impact in view (constitution
 * §3.5). It is app-layer glue: the estimate and profit modules never import each other
 * (§6.8), so the one place that needs both — recompute via `src/estimate/`, color via
 * `src/profit/` — lives here, beside `estimate-compute.ts`. It adds no math.
 *
 * By construction the previewed "proposed" figures equal what the estimate shows *after* the
 * line is accepted: both run the exact same `computeEstimate` over the same lines.
 */

import { type AbsoluteSignal, type BusinessRates, type Computed } from "@/src/engine";
import {
  computeEstimate,
  type EstimateComputation,
  type StoredEstimate,
  type StoredLineItem,
} from "@/src/estimate";
import { estimateSignal } from "@/src/profit";
import { type ProposedLineItem } from "@/src/context";
import { type EstimateRow, type LineItemRow } from "@/src/db/schema";
import { rowsToStoredEstimate } from "./estimate-compute";

/** One side of the preview: the recomputed estimate and its absolute signal. */
export interface PreviewSide {
  readonly computation: EstimateComputation;
  readonly signal: Computed<AbsoluteSignal>;
}

/** The before/after a line-item suggestion would produce. */
export interface LineItemPreview {
  readonly current: PreviewSide;
  readonly proposed: PreviewSide;
}

/** Map a proposed line-item suggestion payload into the estimate module's stored line shape. */
function toStoredLine(proposed: ProposedLineItem): StoredLineItem {
  return {
    category: proposed.category,
    description: proposed.description ?? null,
    laborMinutes: proposed.laborMinutes ?? null,
    quantity: proposed.quantity ?? null,
    unitCostCents: proposed.unitCostCents ?? null,
    priceCents: proposed.priceCents ?? null,
  };
}

/**
 * Compute the current and proposed EPH + signal for adding `proposed` to `estimate`. Returns
 * `null` when there's nothing to measure against — the business has no billable capacity yet,
 * or the estimate can't be priced (e.g. target margin ≥ 100%) — so the UI shows the change
 * without a fabricated number rather than a broken one.
 */
export function previewLineItemImpact(
  estimate: EstimateRow,
  lines: LineItemRow[],
  proposed: ProposedLineItem,
  rates: BusinessRates,
): LineItemPreview | null {
  if (!rates.overheadRecoveryRate.ok) return null;
  const ratesInput = {
    overheadRecoveryRate: rates.overheadRecoveryRate.value,
    burdenedLaborRate: rates.burdenedLaborRate,
  };

  const base = rowsToStoredEstimate(estimate, lines);
  const withProposed: StoredEstimate = { ...base, lines: [...base.lines, toStoredLine(proposed)] };

  const current = computeEstimate(base, ratesInput);
  const proposedComputation = computeEstimate(withProposed, ratesInput);
  if (!current.ok || !proposedComputation.ok) return null;

  return {
    current: {
      computation: current.value,
      signal: estimateSignal(current.value.rollUp, rates.targetProfitPerHour),
    },
    proposed: {
      computation: proposedComputation.value,
      signal: estimateSignal(proposedComputation.value.rollUp, rates.targetProfitPerHour),
    },
  };
}
