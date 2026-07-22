/**
 * The red/yellow/green signal, rendered as a pill that is **never color alone** — the color
 * always carries plain-language text (constitution §3.5, §6). Used on estimates and in the
 * portfolio. "EPH" never appears; the wording is contractor-plain.
 */

import type { SignalColor } from "@/src/engine";

const STYLES: Record<SignalColor, string> = {
  green: "bg-green-100 text-green-900 dark:bg-green-950 dark:text-green-200",
  yellow: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  red: "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200",
};

const DOT: Record<SignalColor, string> = {
  green: "bg-green-600",
  yellow: "bg-amber-500",
  red: "bg-red-600",
};

/** Default plain-language wording per color (overridable via `label`). */
export const SIGNAL_WORD: Record<SignalColor, string> = {
  green: "Pulling its weight",
  yellow: "Borderline",
  red: "Not pulling its weight",
};

export function SignalBadge({
  color,
  label,
}: {
  color: SignalColor;
  label?: string | undefined;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${STYLES[color]}`}
    >
      <span className={`h-2 w-2 rounded-full ${DOT[color]}`} aria-hidden />
      {label ?? SIGNAL_WORD[color]}
    </span>
  );
}

/** A neutral pill for a not-applicable signal (no hours / not set up yet). */
export function SignalUnknown({ label = "Not enough info yet" }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-medium text-neutral-600 dark:bg-neutral-900 dark:text-neutral-400">
      <span className="h-2 w-2 rounded-full bg-neutral-400" aria-hidden />
      {label}
    </span>
  );
}
