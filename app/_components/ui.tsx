/**
 * Shared phone-first primitives (revamp-app-shell). Token-driven (see globals.css) so the
 * paper/green theme and the signal palette live in one place. Server-renderable by default —
 * interactive primitives (BottomSheet, NavTabs) are their own `'use client'` files. Every later
 * revamp phase builds its screens on these rather than re-typing classes.
 */
import type { ReactNode } from "react";

/** A surface card — the default container for a block of content on the paper background. */
export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-2xl border border-line bg-surface p-4 ${className}`}>{children}</div>
  );
}

/** A small pill for a short status or count, always carrying text (never colour alone, §6). The
 * default brand tint reads as a live/positive marker; `muted` is for a neutral state (e.g. archived).
 * Uses the brand palette, distinct from the reserved red/yellow/green signal (that's SignalBadge). */
export function Chip({
  children,
  tone = "brand",
}: {
  children: ReactNode;
  tone?: "brand" | "muted";
}) {
  const cls = tone === "muted" ? "bg-line text-ink-soft" : "bg-brand-soft text-ink";
  return (
    <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>{children}</span>
  );
}

/** A titled section heading with an optional right-aligned action/aside. */
export function SectionHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="mb-2 flex items-center justify-between gap-3">
      <h2 className="text-lg font-semibold text-ink">{title}</h2>
      {action ? <div className="text-sm text-muted">{action}</div> : null}
    </div>
  );
}

/** A label/value row for drill-down panels; the value is tabular-nums for aligned money. */
export function StatRow({
  label,
  value,
  hint,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <div className="min-w-0">
        <div className="text-sm text-ink-soft">{label}</div>
        {hint ? <div className="mt-0.5 text-xs text-muted">{hint}</div> : null}
      </div>
      <div className="shrink-0 font-semibold tabular-nums text-ink">{value}</div>
    </div>
  );
}

/** Stepped-progress indicator for wizard flows (step N of M). */
export function SteppedProgress({ step, total }: { step: number; total: number }) {
  return (
    <div
      className="flex gap-1.5"
      role="progressbar"
      aria-valuenow={step}
      aria-valuemin={1}
      aria-valuemax={total}
      aria-label={`Step ${step} of ${total}`}
    >
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className={`h-1.5 flex-1 rounded-full ${i < step ? "bg-brand" : "bg-line"}`}
        />
      ))}
    </div>
  );
}

/** A teaching empty state: what the surface is for + the primary next action. */
export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-line px-4 py-8 text-center">
      <p className="font-semibold text-ink">{title}</p>
      <p className="mx-auto mt-1 max-w-xs text-sm text-muted">{body}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
