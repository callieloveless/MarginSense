import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getServerSession, tenantDbForSession } from "@/src/db/session";
import { businessRates, computeFromRows } from "@/app/_lib/estimate-compute";
import { EstimateSignalPanel } from "@/app/_components/estimate-signal";
import { SignalBadge } from "@/app/_components/signal-badge";
import { setActiveEstimateAction } from "../actions";
import { EstimateEditor } from "./estimate-editor";

/**
 * Estimate detail (constitution §3.4, §3.5) — the internal costing + profit view of one
 * version. Computes the roll-up and signal server-side via the engine, hosts the line-item
 * editor, and lets the user make this version the active one. Another business's estimate
 * resolves to not-found (tenant-scoped).
 */
export default async function EstimatePage({
  params,
}: {
  params: Promise<{ id: string; estimateId: string }>;
}) {
  const { id: projectId, estimateId } = await params;
  const session = await getServerSession();

  if (session.status === "signed-out") redirect("/sign-in");
  if (session.status === "no-business") redirect("/create-business");
  if (session.status === "unconfigured") {
    return (
      <Shell projectId={projectId}>
        <p className="text-sm text-neutral-500">Connect Supabase and sign in to view this estimate.</p>
      </Shell>
    );
  }

  const tenantDb = tenantDbForSession(session.authUserId, session.businessId);
  const estimate = await tenantDb.getEstimate(estimateId);
  if (!estimate || estimate.projectId !== projectId) notFound();

  const [lines, settings] = await Promise.all([
    tenantDb.getLineItems(estimateId),
    tenantDb.getSettings(),
  ]);

  const rates = settings ? businessRates(settings) : null;
  const computation = rates ? computeFromRows(estimate, lines, rates) : null;

  return (
    <Shell projectId={projectId}>
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">{estimate.versionLabel}</h1>
        {estimate.isActive ? (
          <SignalBadge color="green" label="Active version" />
        ) : (
          <form action={activate.bind(null, projectId, estimateId)}>
            <button className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium dark:border-neutral-700">
              Make active
            </button>
          </form>
        )}
      </div>

      {!settings ? (
        <p className="mt-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
          Finish your business setup in <Link href="/settings" className="underline">Settings</Link> so
          this estimate can be costed.
        </p>
      ) : computation && computation.ok && rates ? (
        <div className="mt-4">
          <EstimateSignalPanel computation={computation.value} targetProfitPerHour={rates.targetProfitPerHour} />
        </div>
      ) : (
        <p className="mt-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
          {computation && !computation.ok
            ? `Can't price this yet: ${computation.reason}.`
            : "Add working days and billable hours in Settings to price this estimate."}
        </p>
      )}

      <div className="mt-6">
        <EstimateEditor
          estimateId={estimateId}
          projectId={projectId}
          initialTargetMargin={String(estimate.targetMarginBp / 100)}
          initialContingency={String(estimate.contingencyBp / 100)}
          initialOverride={estimate.totalPriceOverrideCents === null ? "" : String(estimate.totalPriceOverrideCents / 100)}
          initialLines={lines.map((l) => ({
            category: l.category,
            description: l.description ?? "",
            laborHours: l.laborMinutes === null ? "" : String(l.laborMinutes / 60),
            quantity: l.quantity === null ? "" : String(l.quantity),
            unitCost: l.unitCostCents === null ? "" : String(l.unitCostCents / 100),
          }))}
        />
      </div>
    </Shell>
  );
}

/** Server action wrapper (void) for the make-active form. */
async function activate(projectId: string, estimateId: string) {
  "use server";
  await setActiveEstimateAction(projectId, estimateId);
}

function Shell({ projectId, children }: { projectId: string; children: React.ReactNode }) {
  return (
    <section>
      <Link href={`/projects/${projectId}`} className="text-sm text-neutral-500">
        ← Project
      </Link>
      <div className="mt-2">{children}</div>
    </section>
  );
}
