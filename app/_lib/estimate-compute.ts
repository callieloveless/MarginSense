/**
 * Server-side glue between the DB rows and the two domain modules. It maps stored rows into
 * the `src/estimate/` input shape, pulls the business's derived rates from `src/engine/`, and
 * returns the engine roll-up. This is where the app assembles inputs — no math lives here.
 */

import { deriveRates, type BusinessRates, type Computed } from "@/src/engine";
import { computeEstimate, type EstimateComputation, type StoredEstimate } from "@/src/estimate";
import { settingsRowToEngine } from "@/app/_components/derived-rates";
import type { BusinessSettingsRow, EstimateRow, LineItemRow } from "@/src/db/schema";

/** The business's derived annual rates (from the stored settings, via the engine). */
export function businessRates(settings: BusinessSettingsRow): BusinessRates {
  return deriveRates(settingsRowToEngine(settings));
}

/** Map an estimate row + its line rows into the estimate module's stored shape. */
export function rowsToStoredEstimate(est: EstimateRow, lines: LineItemRow[]): StoredEstimate {
  return {
    targetMarginBp: est.targetMarginBp,
    contingencyBp: est.contingencyBp,
    totalPriceOverrideCents: est.totalPriceOverrideCents,
    lines: lines.map((l) => ({
      category: l.category,
      description: l.description,
      laborMinutes: l.laborMinutes,
      quantity: l.quantity,
      unitCostCents: l.unitCostCents,
      priceCents: l.priceCents,
    })),
  };
}

/**
 * Compute an estimate's roll-up from its rows and the business rates. Not-applicable when the
 * business has no billable capacity yet (no overhead recovery rate) — the caller surfaces a
 * "finish setup" prompt rather than a broken number.
 */
export function computeFromRows(
  est: EstimateRow,
  lines: LineItemRow[],
  rates: BusinessRates,
): Computed<EstimateComputation> {
  if (!rates.overheadRecoveryRate.ok) {
    return { ok: false, reason: rates.overheadRecoveryRate.reason };
  }
  return computeEstimate(rowsToStoredEstimate(est, lines), {
    overheadRecoveryRate: rates.overheadRecoveryRate.value,
    burdenedLaborRate: rates.burdenedLaborRate,
    targetProfitPerHour: rates.targetProfitPerHour,
  });
}
