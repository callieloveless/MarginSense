/**
 * The internal profit view of one estimate (constitution §3.5, §6.6): the red/yellow/green
 * signal plus the roll-up (price, direct cost, overhead, contingency, net profit), every
 * figure drillable to its inputs. Plain language only — "profit per hour", never "EPH".
 * All numbers come from the engine roll-up passed in; nothing is re-derived here.
 */

import { type CentsPerHour, type Computed, formatCents } from "@/src/engine";
import type { EstimateComputation } from "@/src/estimate";
import { estimateSignal } from "@/src/profit";
import { SignalBadge, SignalUnknown } from "./signal-badge";

/** Basis points → a percent string ("4500" → "45.0%"). */
function bpToPercent(bp: number): string {
  return `${(bp / 100).toFixed(1)}%`;
}

function RollUpRow({ label, value, drill }: { label: string; value: string; drill: string }) {
  return (
    <details className="border-b border-neutral-200 py-2 last:border-b-0 dark:border-neutral-800">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
        <span className="text-sm text-neutral-600 dark:text-neutral-400">{label}</span>
        <span className="text-base font-semibold tabular-nums">{value}</span>
      </summary>
      <p className="mt-1 pr-1 text-xs text-neutral-500">{drill}</p>
    </details>
  );
}

export function EstimateSignalPanel({
  computation,
  targetProfitPerHour,
}: {
  computation: EstimateComputation;
  targetProfitPerHour: Computed<CentsPerHour>;
}) {
  const { rollUp, priceSource, price } = computation;
  const signal = estimateSignal(rollUp, targetProfitPerHour);

  const eph = rollUp.eph.ok ? formatCents(rollUp.eph.value) : "—";
  const target = targetProfitPerHour.ok ? formatCents(targetProfitPerHour.value) : "—";

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        {signal.ok ? (
          <SignalBadge color={signal.value.color} />
        ) : (
          <SignalUnknown label="Add labor hours to see the signal" />
        )}
        {signal.ok ? (
          <span className="text-sm text-neutral-600 dark:text-neutral-400">
            profit per hour: <strong>{eph}</strong> vs your {target} target
          </span>
        ) : null}
      </div>

      <div className="rounded-lg border border-neutral-200 px-3 dark:border-neutral-800">
        <RollUpRow
          label="Price to client"
          value={formatCents(rollUp.revenue)}
          drill={
            priceSource === "solved"
              ? `Solved so your profit margin hits ${bpToPercent(computation.rollUp.netMargin.ok ? computation.rollUp.netMargin.value : 0)}.`
              : `You set this price (${formatCents(price)}); margin is whatever it works out to.`
          }
        />
        <RollUpRow
          label="Direct cost"
          value={formatCents(rollUp.directCost)}
          drill="Labor (hours × your burdened rate) plus materials and other line costs you entered."
        />
        <RollUpRow
          label="Overhead on this job"
          value={formatCents(rollUp.overheadAllocated)}
          drill={`${rollUp.laborHours} labor hours × your overhead recovery rate.`}
        />
        <RollUpRow
          label="Contingency"
          value={formatCents(rollUp.contingency)}
          drill="A cushion for the unexpected, a real reserved cost that lowers profit."
        />
        <RollUpRow
          label="Net profit"
          value={formatCents(rollUp.netProfit)}
          drill="Price − direct cost − overhead − contingency."
        />
        <RollUpRow
          label="Profit margin"
          value={rollUp.netMargin.ok ? bpToPercent(rollUp.netMargin.value) : "—"}
          drill="Net profit ÷ price."
        />
        <RollUpRow
          label="Profit per hour"
          value={eph}
          drill={`Net profit ÷ ${rollUp.laborHours} labor hours — measured against your ${target} target.`}
        />
      </div>
    </div>
  );
}
