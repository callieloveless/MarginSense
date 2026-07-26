"use client";

/**
 * Dashboard camera quick-capture (add-portfolio-pulse). The prototype's header camera: opens a
 * job-picker bottom sheet (the R1 BottomSheet's first consumer) and routes to the chosen job's
 * photo surface. Never a dead control — with no jobs it teaches and offers a new job. Real work
 * today (the job's context/photos page); R6 grows the destination into the full Photos surface.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { BottomSheet } from "@/app/_components/bottom-sheet";

export function DashboardCapture({ jobs }: { jobs: { id: string; name: string }[] }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Take a job photo"
        className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand text-brand-ink"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h1.7l1-1.6A1 1 0 0 1 9 5h6a1 1 0 0 1 .85.4l1 1.6h1.65A1.5 1.5 0 0 1 20 8.5v9A1.5 1.5 0 0 1 18.5 19h-13A1.5 1.5 0 0 1 4 17.5z" />
          <circle cx="12" cy="12.5" r="3.2" />
        </svg>
      </button>

      <BottomSheet open={open} onClose={() => setOpen(false)} title="Shoot a photo for…">
        {jobs.length === 0 ? (
          <div className="space-y-3">
            <p className="text-sm text-muted">No jobs yet — set one up, then shoot away.</p>
            <button
              type="button"
              onClick={() => go("/projects")}
              className="w-full rounded-xl bg-brand px-4 py-3 text-center font-semibold text-brand-ink"
            >
              + New job
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {jobs.map((j) => (
              <button
                key={j.id}
                type="button"
                onClick={() => go(`/projects/${j.id}/context`)}
                className="flex items-center justify-between rounded-xl bg-paper px-4 py-3 text-left"
              >
                <span className="font-medium text-ink">{j.name}</span>
                <span aria-hidden className="text-muted">›</span>
              </button>
            ))}
          </div>
        )}
      </BottomSheet>
    </>
  );
}
