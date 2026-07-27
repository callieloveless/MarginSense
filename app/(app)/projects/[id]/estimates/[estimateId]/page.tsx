import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getServerSession, tenantDbForSession } from "@/src/db/session";
import { estimateSignal } from "@/src/profit";
import { formatCents, type SignalColor } from "@/src/engine";
import { businessRates, computeFromRows } from "@/app/_lib/estimate-compute";
import { estimateComputationToDTO } from "@/app/_lib/estimate-dto";
import { Chip } from "@/app/_components/ui";
import { SignalBadge, SignalUnknown } from "@/app/_components/signal-badge";
import { createEstimateAction, duplicateEstimateAction, setActiveEstimateAction } from "../actions";
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

  // Every version's own signal for the switcher — each computed independently by the engine.
  const versions = await tenantDb.listEstimates(projectId);
  const versionCards: VersionCard[] = await Promise.all(
    versions.map(async (v) => {
      const vLines = v.id === estimateId ? lines : await tenantDb.getLineItems(v.id);
      const comp = rates ? computeFromRows(v, vLines, rates) : null;
      let color: SignalColor | null = null;
      let ephCents: number | null = null;
      if (rates && comp && comp.ok) {
        const sig = estimateSignal(comp.value.rollUp, rates.targetProfitPerHour);
        color = sig.ok ? sig.value.color : null;
        ephCents = comp.value.rollUp.eph.ok ? comp.value.rollUp.eph.value : null;
      }
      return { id: v.id, label: v.versionLabel, isActive: v.isActive, color, ephCents };
    }),
  );

  return (
    <Shell projectId={projectId}>
      <VersionsStrip
        projectId={projectId}
        currentId={estimateId}
        cards={versionCards}
        nextLabel={`v${versions.length + 1}`}
      />

      <div className="mt-4 flex items-center justify-between gap-3">
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
          initialLineIds={lines.map((l) => l.id)}
          initialDto={initialDto}
        />
      </div>
    </Shell>
  );
}

interface VersionCard {
  id: string;
  label: string;
  isActive: boolean;
  color: SignalColor | null;
  ephCents: number | null;
}

/** The version switcher: each version with its own signal + profit-per-hour, plus duplicate / new. */
function VersionsStrip({
  projectId,
  currentId,
  cards,
  nextLabel,
}: {
  projectId: string;
  currentId: string;
  cards: VersionCard[];
  nextLabel: string;
}) {
  return (
    <div className="space-y-2">
      <div className="flex gap-2 overflow-x-auto pb-1">
        {cards.map((v) => {
          const current = v.id === currentId;
          return (
            <Link
              key={v.id}
              href={`/projects/${projectId}/estimates/${v.id}`}
              aria-current={current ? "page" : undefined}
              className={`flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-sm ${
                current ? "border-brand bg-brand-soft text-ink" : "border-line text-ink-soft"
              }`}
            >
              <span className="font-medium">{v.label}</span>
              {v.color ? <SignalBadge color={v.color} size="sm" /> : <SignalUnknown label="no signal" size="sm" />}
              <span className="tabular-nums text-muted">
                {v.ephCents === null ? "—" : `${formatCents(v.ephCents)}/hr`}
              </span>
              {v.isActive ? <Chip>Active</Chip> : null}
            </Link>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-2">
        <form action={duplicateEstimateAction.bind(null, projectId, currentId)}>
          <button className="rounded-full border border-line px-3 py-1.5 text-sm font-medium text-ink">
            Duplicate this version
          </button>
        </form>
        <form action={newVersion.bind(null, projectId)}>
          <input type="hidden" name="versionLabel" value={nextLabel} />
          <button className="rounded-full border border-line px-3 py-1.5 text-sm font-medium text-ink">
            + New version
          </button>
        </form>
      </div>
    </div>
  );
}

/** Server action wrapper (void) for the make-active form. */
async function activate(projectId: string, estimateId: string) {
  "use server";
  await setActiveEstimateAction(projectId, estimateId);
}

/** Server action wrapper (void) for the new-version form (createEstimateAction returns a result). */
async function newVersion(projectId: string, formData: FormData) {
  "use server";
  await createEstimateAction(projectId, formData);
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
