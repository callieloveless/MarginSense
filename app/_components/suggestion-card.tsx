/**
 * A pending suggestion, rendered the same way no matter which tool produced it (constitution
 * §5) — it reads only the suggestion's `target` and `payload`, never a tool name. For a
 * line-item suggestion it shows the **profit impact of accepting** (profit-per-hour and its
 * red/yellow/green signal, now → after), so the decision is made with the number in view
 * (§3.5). Accepting runs the same change #5 accept path, unchanged.
 */

import { formatCents } from "@/src/engine";
import {
  FINDING_SEVERITY_LABEL,
  findingSeverityOf,
  type FindingSeverity,
} from "@/src/context";
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

/** A proposed `code_ref`'s displayable detail (citation, compliance consequence, source), or null
 * when the suggestion isn't one. Read from the payload — no branch on the producing tool. */
interface CodeRefDetail {
  citation: string;
  complianceNote: string | null;
  sourceUrl: string | null;
}
function codeRefDetail(suggestion: SuggestionRow): CodeRefDetail | null {
  if (suggestion.target !== "context_entry") return null;
  const p = (suggestion.payload ?? {}) as Record<string, unknown>;
  if (p.kind !== "code_ref") return null;
  const inner = (p.payload ?? {}) as Record<string, unknown>;
  const url = typeof inner.sourceUrl === "string" ? inner.sourceUrl : null;
  return {
    citation: String(inner.citation ?? ""),
    complianceNote: typeof inner.complianceNote === "string" ? inner.complianceNote : null,
    // Only render a real http(s) link (defensive over the JSON blob).
    sourceUrl: url && /^https?:\/\//.test(url) ? url : null,
  };
}

/** The severity of a proposed `finding`, or null when the suggestion isn't one. Read from the
 * payload — like everything else on this card, with no branch on which tool produced it. */
function findingSeverity(suggestion: SuggestionRow): FindingSeverity | null {
  if (suggestion.target !== "context_entry") return null;
  const p = (suggestion.payload ?? {}) as Record<string, unknown>;
  return p.kind === "finding" ? findingSeverityOf(p.payload) : null;
}

/** A finding's severity, always as **words**; colour only reinforces them (constitution §6). */
function SeverityBadge({ severity }: { severity: FindingSeverity }) {
  const tone =
    severity === "safety"
      ? "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200"
      : severity === "attention"
        ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200"
        : "bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300";
  return (
    <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium ${tone}`}>
      {FINDING_SEVERITY_LABEL[severity]}
    </span>
  );
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
  const severity = findingSeverity(suggestion);
  const code = codeRefDetail(suggestion);
  return (
    <li className="rounded-lg border border-neutral-200 p-3 dark:border-neutral-800">
      {severity ? (
        <div className="mb-1">
          <SeverityBadge severity={severity} />
        </div>
      ) : null}
      <p className="text-sm">{describe(suggestion)}</p>

      {code ? (
        <div className="mt-1 space-y-1 text-xs text-neutral-600 dark:text-neutral-400">
          <p>{code.citation}</p>
          {/* The consequence framed as cost/time — why a code matters to the job (§3.5). */}
          {code.complianceNote ? (
            <p className="text-amber-800 dark:text-amber-300">Impact: {code.complianceNote}</p>
          ) : null}
          {code.sourceUrl ? (
            <a href={code.sourceUrl} target="_blank" rel="noreferrer" className="inline-block underline">
              Source
            </a>
          ) : null}
        </div>
      ) : null}

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
