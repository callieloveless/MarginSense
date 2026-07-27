import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getServerSession, tenantDbForSession } from "@/src/db/session";
import { businessRates, computeFromRows } from "@/app/_lib/estimate-compute";
import { estimateComputationToDTO } from "@/app/_lib/estimate-dto";
import { Chip } from "@/app/_components/ui";
import { setActiveEstimateAction } from "../actions";
import { EstimateEditor } from "./estimate-editor";

/**
 * Estimate detail (constitution §3.4, §3.5) — the internal costing + profit view of one version.
 * The engine computes the roll-up and the per-line breakdown server-side; the editor renders them
 * (and updates them live) and hosts the line-item editing. Another business's estimate resolves to
 * not-found (tenant-scoped).
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
        <p className="text-sm text-muted">Connect Supabase and sign in to view this estimate.</p>
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

  // Compute the first-paint DTO from the engine; null when the estimate can't be priced yet (no
  // settings, or an unreachable target margin) — the editor stays usable and says why.
  const rates = settings ? businessRates(settings) : null;
  const computation = rates ? computeFromRows(estimate, lines, rates) : null;
  const initialDto =
    rates && computation && computation.ok
      ? estimateComputationToDTO(
          computation.value,
          lines.map((l) => l.priceCents != null),
          rates.targetProfitPerHour,
        )
      : null;

  return (
    <Shell projectId={projectId}>
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-ink">{estimate.versionLabel}</h1>
        {estimate.isActive ? (
          <Chip>Active version</Chip>
        ) : (
          <form action={activate.bind(null, projectId, estimateId)}>
            <button className="rounded-full border border-line px-3 py-1.5 text-sm font-medium text-ink">
              Make active
            </button>
          </form>
        )}
      </div>

      <div className="mt-4">
        <EstimateEditor
          estimateId={estimateId}
          projectId={projectId}
          initialTargetMargin={String(estimate.targetMarginBp / 100)}
          initialContingency={String(estimate.contingencyBp / 100)}
          initialOverride={
            estimate.totalPriceOverrideCents === null ? "" : String(estimate.totalPriceOverrideCents / 100)
          }
          initialLines={lines.map((l) => ({
            category: l.category,
            description: l.description ?? "",
            laborHours: l.laborMinutes === null ? "" : String(l.laborMinutes / 60),
            quantity: l.quantity === null ? "" : String(l.quantity),
            unitCost: l.unitCostCents === null ? "" : String(l.unitCostCents / 100),
            price: l.priceCents === null || l.priceCents === undefined ? "" : String(l.priceCents / 100),
          }))}
          initialDto={initialDto}
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
      <Link href={`/projects/${projectId}`} className="text-sm text-muted">
        ← Project
      </Link>
      <div className="mt-2">{children}</div>
    </section>
  );
}
