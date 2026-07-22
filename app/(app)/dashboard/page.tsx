import Link from "next/link";
import { getServerSession, tenantDbForSession } from "@/src/db/session";
import type { Computed, Ratio } from "@/src/engine";
import { buildPortfolio, type PortfolioJobInput } from "@/src/profit";
import { businessRates, computeFromRows } from "@/app/_lib/estimate-compute";
import { SignalBadge, SignalUnknown } from "@/app/_components/signal-badge";

/**
 * Portfolio dashboard (constitution §2, §3.5) — does the whole book of work pull its weight?
 * Ranks each project's active estimate worst-first by the engine's comparative view, and
 * shows each job's "% of your year" and "% of your profit goal" in plain language. Every
 * number comes from the engine; the color is always paired with text.
 */
export default async function DashboardPage() {
  const session = await getServerSession();

  if (session.status !== "ready") {
    return (
      <section>
        <h1 className="text-xl font-semibold">Dashboard</h1>
        <p className="mt-2 text-sm text-neutral-500">
          {session.status === "unconfigured"
            ? "Connect Supabase to see your portfolio."
            : "Sign in to see your portfolio."}
        </p>
      </section>
    );
  }

  const tenantDb = tenantDbForSession(session.authUserId, session.businessId);
  const settings = await tenantDb.getSettings();

  if (!settings) {
    return (
      <section className="space-y-3">
        <h1 className="text-xl font-semibold">Dashboard</h1>
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          Finish your business setup so we can measure each job against your year.
        </p>
        <Link href="/onboarding" className="inline-block rounded-md bg-neutral-900 px-4 py-2 text-base font-medium text-white dark:bg-white dark:text-neutral-900">
          Set up your business
        </Link>
      </section>
    );
  }

  const rates = businessRates(settings);
  const [feed, projects] = await Promise.all([
    tenantDb.listActiveEstimatesWithLines(),
    tenantDb.listProjects(),
  ]);
  const nameById = new Map(projects.map((p) => [p.id, p.clientName]));

  // Compute each active estimate's roll-up, then assemble the portfolio (engine does the math).
  const jobs: PortfolioJobInput[] = [];
  for (const { estimate, lines } of feed) {
    const computation = computeFromRows(estimate, lines, rates);
    if (!computation.ok) continue;
    const { rollUp, laborHours } = computation.value;
    jobs.push({
      projectId: estimate.projectId,
      projectName: nameById.get(estimate.projectId) ?? "Project",
      laborHours,
      netProfit: rollUp.netProfit,
      overheadAllocated: rollUp.overheadAllocated,
    });
  }

  const ranked = buildPortfolio(jobs, {
    annualBillableHours: rates.annualBillableHours,
    grossProfitGoal: rates.grossProfitGoal,
  });

  return (
    <section>
      <h1 className="text-xl font-semibold">Dashboard</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Each job ranked by whether the profit it earns justifies the hours it eats. Worst first.
      </p>

      {ranked.length === 0 ? (
        <p className="mt-6 rounded-md bg-neutral-100 px-3 py-2 text-sm text-neutral-500 dark:bg-neutral-900">
          No active estimates yet. Open a project, build an estimate, and mark a version active
          to see it here.
        </p>
      ) : (
        <ul className="mt-5 space-y-3">
          {ranked.map((job) => (
            <li
              key={job.projectId}
              className="rounded-lg border border-neutral-200 px-3 py-3 dark:border-neutral-800"
            >
              <div className="flex items-center justify-between gap-3">
                <Link href={`/projects/${job.projectId}`} className="font-medium">
                  {job.projectName}
                </Link>
                {job.signal.ok ? <SignalBadge color={job.signal.value.color} /> : <SignalUnknown />}
              </div>
              {job.signal.ok ? (
                <p className="mt-1.5 text-sm text-neutral-600 dark:text-neutral-400">
                  Uses <strong>{pct1(job.signal.value.percentOfYear)}</strong> of your year and
                  delivers <strong>{pct2(job.signal.value.percentOfProfitGoal)}</strong> of your
                  profit goal.
                </p>
              ) : (
                <p className="mt-1.5 text-sm text-neutral-500">
                  Add labor hours to this job&apos;s active estimate to rank it.
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Format a computed ratio as a percent with one decimal ("0.0533" → "5.3%"). */
function pct1(r: Computed<Ratio>): string {
  return r.ok ? `${(r.value * 100).toFixed(1)}%` : "—";
}

/** Format a computed ratio as a percent with two decimals ("0.100463" → "10.05%"). */
function pct2(r: Computed<Ratio>): string {
  return r.ok ? `${(r.value * 100).toFixed(2)}%` : "—";
}
