/**
 * The persistent profit-signal header on a job's surfaces (constitution §3.5, §6) — the
 * red/yellow/green the whole product turns on, kept in view while running tools and reviewing
 * suggestions. Color is always paired with text; absent-safe when there's no active estimate.
 * Reads the shared {@link JobProfit} loader so it and the suggestion previews agree.
 */

import Link from "next/link";
import { formatCents } from "@/src/engine";
import { estimateSignal } from "@/src/profit";
import { type JobProfit } from "@/app/_lib/job-profit";
import { SignalBadge, SignalUnknown } from "./signal-badge";

export function ProfitHeader({ job, projectId }: { job: JobProfit | null; projectId: string }) {
  if (!job || !job.computation) {
    return (
      <div className="rounded-lg border border-neutral-200 px-3 py-2 text-sm text-neutral-500 dark:border-neutral-800">
        No active estimate yet —{" "}
        <Link href={`/projects/${projectId}`} className="underline">
          build one
        </Link>{" "}
        to see if this job pulls its weight.
      </div>
    );
  }

  const { computation, rates } = job;
  const signal = estimateSignal(computation.rollUp, rates.targetProfitPerHour);
  const eph = computation.rollUp.eph.ok ? `${formatCents(computation.rollUp.eph.value)}/hr` : "—";
  const target = rates.targetProfitPerHour.ok ? `${formatCents(rates.targetProfitPerHour.value)}/hr` : "—";

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-neutral-200 px-3 py-2 dark:border-neutral-800">
      {signal.ok ? <SignalBadge color={signal.value.color} /> : <SignalUnknown label="Add labor hours to see the signal" />}
      {signal.ok ? (
        <span className="text-sm text-neutral-600 dark:text-neutral-400">
          profit per hour <strong>{eph}</strong> vs your {target} target
        </span>
      ) : null}
    </div>
  );
}
