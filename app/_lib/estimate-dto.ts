/**
 * The serializable shape of a computed estimate, for the editor's first paint and its live preview
 * (revamp-estimate-editor). The engine (`src/estimate` + `src/profit`) produces the numbers; this
 * maps them to plain values that cross the server-action boundary, so the same panel renders the
 * server-rendered page and the debounced preview identically. No math is re-implemented here beyond
 * a per-line markup ratio, which reuses the engine's `ratioToBp` primitive.
 *
 * Honesty gate (constitution §6; R5 critique #1): a per-line profit-per-hour **signal** is emitted
 * ONLY for a labor line whose price the user entered. With no entered price the engine allocates
 * each line's price cost-proportionally, so every baseline labor line's profit-per-hour is identical
 * by construction — a per-line colour there would be a degenerate, misleading signal.
 */

import {
  type BasisPoints,
  type Cents,
  type CentsPerHour,
  type Computed,
  type SignalColor,
  notApplicable,
  ratioToBp,
} from "@/src/engine";
import type { EstimateComputation, PriceSource } from "@/src/estimate";
import { estimateSignal } from "@/src/profit";

/** Per-line markup = (price − cost) / cost, in basis points, via the engine's ratio primitive.
 * Not-applicable when cost is 0 — no divide-by-zero, no fabricated percentage. */
export function markupBasisPoints(priceCents: Cents, costCents: Cents): Computed<BasisPoints> {
  return costCents === 0
    ? notApplicable("no cost")
    : { ok: true, value: ratioToBp((priceCents - costCents) / costCents) };
}

/** One line's economics as the editor renders them (plain, serializable). */
export interface EstimateLineDTO {
  readonly category: string;
  readonly priceCents: number;
  readonly costCents: number;
  readonly netCents: number;
  readonly laborHours: number;
  /** The user entered this line's price (vs. the derived baseline). */
  readonly priced: boolean;
  /** Profit-per-hour — only for an entered-price labor line; null otherwise (never fabricated). */
  readonly ephCents: number | null;
  /** Red/yellow/green — only where it is real (an entered-price labor line); null otherwise. */
  readonly signalColor: SignalColor | null;
  /** Markup over cost in basis points; null when cost is 0. */
  readonly markupBp: number | null;
}

/** A computed estimate as the editor's panel + line rows render it (plain, serializable). */
export interface EstimateDTO {
  readonly signalColor: SignalColor | null;
  readonly ephCents: number | null;
  readonly targetEphCents: number | null;
  readonly priceCents: number;
  readonly directCostCents: number;
  readonly overheadCents: number;
  readonly contingencyCents: number;
  readonly netProfitCents: number;
  readonly netMarginBp: number | null;
  readonly priceSource: PriceSource;
  readonly lines: EstimateLineDTO[];
}

/**
 * Map an engine computation to the editor DTO. `priced[i]` says whether the user entered line i's
 * price; it gates the per-line signal (the honesty rule above). `targetProfitPerHour` is the
 * business's target the estimate signal is measured against.
 */
export function estimateComputationToDTO(
  computation: EstimateComputation,
  priced: readonly boolean[],
  targetProfitPerHour: Computed<CentsPerHour>,
): EstimateDTO {
  const { rollUp } = computation;
  const signal = estimateSignal(rollUp, targetProfitPerHour);

  const lines: EstimateLineDTO[] = computation.lines.map((lb, i) => {
    const isPriced = priced[i] ?? false;
    // Colour only where it's a genuine per-line decision: an entered price on a labor line.
    const realSignal = isPriced && lb.category === "labor";
    const markup = markupBasisPoints(lb.price, lb.directCost);
    return {
      category: lb.category,
      priceCents: lb.price,
      costCents: lb.directCost,
      netCents: lb.net,
      laborHours: lb.laborHours,
      priced: isPriced,
      ephCents: realSignal && lb.profitPerHour.ok ? lb.profitPerHour.value : null,
      signalColor: realSignal && lb.signal.ok ? lb.signal.value.color : null,
      markupBp: markup.ok ? markup.value : null,
    };
  });

  return {
    signalColor: signal.ok ? signal.value.color : null,
    ephCents: rollUp.eph.ok ? rollUp.eph.value : null,
    targetEphCents: targetProfitPerHour.ok ? targetProfitPerHour.value : null,
    priceCents: rollUp.revenue,
    directCostCents: rollUp.directCost,
    overheadCents: rollUp.overheadAllocated,
    contingencyCents: rollUp.contingency,
    netProfitCents: rollUp.netProfit,
    netMarginBp: rollUp.netMargin.ok ? rollUp.netMargin.value : null,
    priceSource: computation.priceSource,
    lines,
  };
}
