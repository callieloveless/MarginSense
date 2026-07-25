"use client";

/**
 * Bottom sheet primitive (revamp-app-shell). A phone-first modal that slides from the bottom.
 * Portalled to <body>, focus-trapped, dismisses on backdrop tap + ESC + explicit close, locks
 * body scroll while open, and RESTORES focus to the invoking element on close. Its first
 * consumer is the dashboard job-picker (R2b). Kept dependency-free (no drawer library).
 * Renders nothing when closed or before mount (safe to render open during SSR).
 */
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

export function BottomSheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const panel = panelRef.current;
      if (!panel) return;
      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const first = items[0]!;
      const last = items[items.length - 1]!;
      const active = document.activeElement;
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    },
    [onClose],
  );

  useEffect(() => {
    if (!open) return;
    // Remember what had focus so we can return it when the sheet closes (WAI-ARIA dialog pattern).
    const invoker = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const panel = panelRef.current;
    const firstFocusable = panel?.querySelector<HTMLElement>(FOCUSABLE);
    (firstFocusable ?? panel)?.focus();
    return () => {
      document.body.style.overflow = prevOverflow;
      if (invoker && invoker.isConnected) invoker.focus();
    };
  }, [open]);

  if (!open || !mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? titleId : undefined}
      aria-label={title ? undefined : "Options"}
      onKeyDown={onKeyDown}
    >
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 h-full w-full cursor-default bg-ink/40"
        onClick={onClose}
      />
      <div
        ref={panelRef}
        tabIndex={-1}
        className="relative w-full max-w-md rounded-t-3xl bg-surface p-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] outline-none"
      >
        <div className="mx-auto mb-4 h-1 w-9 rounded-full bg-line" aria-hidden />
        {title ? (
          <h2 id={titleId} className="mb-3 text-lg font-semibold text-ink">
            {title}
          </h2>
        ) : null}
        {children}
      </div>
    </div>,
    document.body,
  );
}
