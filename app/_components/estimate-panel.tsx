/**
 * The internal profit panel for one estimate (constitution §3.5, §6.6) — the red/yellow/green plus
 * the roll-up (price, direct cost, overhead, contingency, net profit, margin, profit-per-hour), each
 * figure drillable to its inputs. Plain language ("profit per hour", never "EPH"). It renders a plain
 * {@link EstimateDTO} computed by the engine, so the server-rendered first paint and the editor's
 * live preview use the identical renderer. Token-driven; colour always paired with text.
 */

import { formatCents } from "@/src/engine";
import type { EstimateDTO } from "@/app/_lib/estimate-dto";
import { Card } from "./ui";
import { SignalBadge, SignalUnknown } from "./signal-badge";

/** Basis points → a percent string ("4500" → "45.0%"). */
function bpToPercent(bp: number): string {
  return `${(bp / 100).toFixed(1)}%`;
}

function RollUpRow({ label, value, drill }: { label: string; value: string; drill: string }) {
  return (
    <details className="border-b border-line py-2 last:border-b-0">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
        <span className="text-sm text-ink-soft">{label}</span>
        <span className="text-base font-semibold tabular-nums text-ink">{value}</span>
      </summary>
      <p className="mt-1 pr-1 text-xs text-muted">{drill}</p>
    </details>
  );
}

function priceSourceDrill(dto: EstimateDTO): string {
  switch (dto.priceSource) {
    case "solved":
      return `Solved so your profit margin hits ${dto.netMarginBp === null ? "your target" : bpToPercent(dto.netMarginBp)}.`;
    case "override":
      return "You set the total price; your margin is whatever it works out to.";
    case "line":
      return "Priced on the lines; your margin is whatever it works out to.";
  }
}

export function EstimatePanel({
  dto,
  updating = false,
  note = null,
}: {
  dto: EstimateDTO;
  /** A live recompute is in flight — dim the numbers and announce politely. */
  updating?: boolean;
  /** A plain hint shown when the live preview can't price the latest edit (numbers update on save). */
  note?: string | null;
}) {
  const eph = dto.ephCents === null ? "—" : formatCents(dto.ephCents);
  const target = dto.targetEphCents === null ? "—" : formatCents(dto.targetEphCents);

  return (
    <Card className="space-y-3">
      <div aria-live="polite" className={updating ? "opacity-60 transition-opacity" : "transition-opacity"}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          {dto.signalColor ? (
            <SignalBadge color={dto.signalColor} />
          ) : (
            <SignalUnknown label="Add labor hours to see the signal" />
          )}
          {dto.signalColor ? (
            <span className="text-sm text-ink-soft">
              profit per hour <strong className="text-ink">{eph}</strong> vs your {target} target
            </span>
          ) : null}
        </div>
        {updating ? <p className="mt-1 text-xs text-muted">updating…</p> : null}
        {note ? <p className="mt-1 text-xs text-muted">{note}</p> : null}
      </div>

      <div className="rounded-xl border border-line px-3">
        <RollUpRow label="Price to client" value={formatCents(dto.priceCents)} drill={priceSourceDrill(dto)} />
        <RollUpRow
          label="Direct cost"
          value={formatCents(dto.directCostCents)}
          drill="Labor (hours × your burdened rate) plus materials and other line costs you entered."
        />
        <RollUpRow
          label="Overhead on this job"
          value={formatCents(dto.overheadCents)}
          drill="Your labor hours × your overhead recovery rate."
        />
        <RollUpRow
          label="Contingency"
          value={formatCents(dto.contingencyCents)}
          drill="A cushion for the unexpected — a real reserved cost that lowers profit."
        />
        <RollUpRow
          label="Net profit"
          value={formatCents(dto.netProfitCents)}
          drill="Price − direct cost − overhead − contingency."
        />
        <RollUpRow
          label="Profit margin"
          value={dto.netMarginBp === null ? "—" : bpToPercent(dto.netMarginBp)}
          drill="Net profit ÷ price."
        />
        <RollUpRow
          label="Profit per hour"
          value={eph}
          drill={`Net profit ÷ your labor hours — measured against your ${target} target.`}
        />
      </div>
    </Card>
  );
}
