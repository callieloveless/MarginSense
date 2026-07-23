/**
 * A pending suggestion, rendered the same way no matter which tool produced it (constitution
 * §5) — it reads only the suggestion's `target` and `payload`, never a tool name. For a
 * line-item suggestion it shows the **profit impact of accepting** (profit-per-hour and its
 * red/yellow/green signal, now → after), so the decision is made with the number in view
 * (§3.5). Accepting runs the same change #5 accept path, unchanged.
 */

import { formatCents } from "@/src/engine";
import type { SuggestionRow } from "@/src/db/schema";
import type { LineItemPreview, PreviewSide } from "@/app/_lib/suggestion-preview";
import { SignalBadge, SignalUnknown } from "./signal-badge";

/** Defensive plain-language description of what a suggestion proposes (payload is JSON). */
function describe(suggestion: SuggestionRow): string {
  const p = (suggestion.payload ?? {}) as Record<string, unknown>;
  if (suggestion.target === "estimate_line_item") {
    const cat = String(p.category ?? "line item");
    return `Add a ${cat}${p.description ? ` — ${String(p.description)}` : ""} to the estimate.`;
  }
  const kind = String(p.kind ?? "fact");
  const inner = (p.payload ?? {}) as Record<string, unknown>;
  switch (kind) {
    case "material":
      return `Pin material: ${String(inner.name ?? "")}`.trim();
    case "code_ref":
      return `Pin code: ${String(inner.code ?? "")}`.trim();
    case "finding":
      return `Pin finding: ${String(inner.summary ?? "")}`.trim();
    case "photo":
      return "Pin a photo to this job.";
    case "fact":
    default:
      return `Pin ${kind}: ${String(inner.label ?? "")}${inner.value ? ` — ${String(inner.value)}` : ""}`.trim();
  }
}

/** The profit-per-hour figure + signal for one side of the preview. */
function EphFigure({ side }: { side: PreviewSide }) {
  const { rollUp } = side.computation;
  const eph = rollUp.eph.ok ? `${formatCents(rollUp.eph.value)}/hr` : "—";
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="font-semibold tabular-nums">{eph}</span>
      {side.signal.ok ? <SignalBadge color={side.signal.value.color} /> : <SignalUnknown label="no signal" />}
    </span>
  );
}

/** The before → after profit-per-hour impact of accepting a line-item suggestion. */
function ProfitImpact({ preview }: { preview: LineItemPreview }) {
  const cur = preview.current.computation.rollUp.eph;
  const next = preview.proposed.computation.rollUp.eph;
  const delta = cur.ok && next.ok ? next.value - cur.value : null;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
      <span className="text-neutral-500">Profit per hour</span>
      <EphFigure side={preview.current} />
      <span aria-hidden className="text-neutral-400">
        →
      </span>
      <EphFigure side={preview.proposed} />
      {delta !== null ? (
        <span className="text-neutral-500">
          ({delta >= 0 ? "+" : "−"}
          {formatCents(Math.abs(delta))}/hr)
        </span>
      ) : null}
    </div>
  );
}

export function SuggestionCard({
  suggestion,
  preview,
  accept,
  dismiss,
}: {
  suggestion: SuggestionRow;
  /** Present only for a line-item suggestion with an active estimate to measure against. */
  preview?: LineItemPreview | null | undefined;
  accept: () => void | Promise<void>;
  dismiss: () => void | Promise<void>;
}) {
  const isLineItem = suggestion.target === "estimate_line_item";
  return (
    <li className="rounded-lg border border-neutral-200 p-3 dark:border-neutral-800">
      <p className="text-sm">{describe(suggestion)}</p>

      {preview ? (
        <ProfitImpact preview={preview} />
      ) : isLineItem ? (
        <p className="mt-1 text-xs text-neutral-500">No active estimate to measure the impact against yet.</p>
      ) : null}

      <div className="mt-2 flex gap-2">
        <form action={accept}>
          <button className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white dark:bg-white dark:text-neutral-900">
            Accept
          </button>
        </form>
        <form action={dismiss}>
          <button className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium dark:border-neutral-700">
            Dismiss
          </button>
        </form>
      </div>
    </li>
  );
}
