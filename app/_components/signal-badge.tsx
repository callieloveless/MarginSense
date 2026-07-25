/**
 * The red/yellow/green signal, rendered as a chip that is **never color alone** — the color
 * always carries plain-language text (constitution §3.5, §6). Colors come from the signal
 * tokens (globals.css), the single home for the threshold palette. Used on estimates, lines,
 * and the portfolio. "EPH" never appears; the wording is contractor-plain. A `sm` size gives
 * the compact chip the dense surfaces (line rows, cards) use.
 */

import type { SignalColor } from "@/src/engine";

type Size = "sm" | "md";

const STYLES: Record<SignalColor, string> = {
  green: "bg-signal-green-bg text-signal-green-fg",
  yellow: "bg-signal-amber-bg text-signal-amber-fg",
  red: "bg-signal-red-bg text-signal-red-fg",
};

const DOT: Record<SignalColor, string> = {
  green: "bg-signal-green",
  yellow: "bg-signal-amber",
  red: "bg-signal-red",
};

/** Default plain-language wording per color (overridable via `label`). */
export const SIGNAL_WORD: Record<SignalColor, string> = {
  green: "Pulling its weight",
  yellow: "Borderline",
  red: "Not pulling its weight",
};

function pad(size: Size): string {
  return size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs";
}

export function SignalBadge({
  color,
  label,
  size = "md",
}: {
  color: SignalColor;
  label?: string | undefined;
  size?: Size;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-semibold ${pad(size)} ${STYLES[color]}`}
    >
      <span className={`h-2 w-2 rounded-full ${DOT[color]}`} aria-hidden />
      {label ?? SIGNAL_WORD[color]}
    </span>
  );
}

/** A neutral chip for a not-applicable signal (no hours / not set up yet). */
export function SignalUnknown({
  label = "Not enough info yet",
  size = "md",
}: {
  label?: string;
  size?: Size;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full bg-signal-none-bg font-semibold text-signal-none-fg ${pad(size)}`}
    >
      <span className="h-2 w-2 rounded-full bg-muted" aria-hidden />
      {label}
    </span>
  );
}
