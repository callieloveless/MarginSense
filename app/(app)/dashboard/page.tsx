import Link from "next/link";
import { getServerSession, tenantDbForSession } from "@/src/db/session";
import {
  formatCents,
  type AbsoluteSignal,
  type CentsPerHour,
  type ComparativeSignal,
  type Computed,
  type PortfolioPulse,
  type Ratio,
} from "@/src/engine";
import {
  buildPortfolio,
  estimateSignal,
  portfolioPulse,
  type PortfolioJobInput,
} from "@/src/profit";
import { businessRates, computeFromRows } from "@/app/_lib/estimate-compute";
import { SignalBadge, SignalUnknown } from "@/app/_components/signal-badge";
import { Card, EmptyState, SectionHeader, StatRow } from "@/app/_components/ui";
import { DashboardCapture } from "./dashboard-capture";

/**
 * Portfolio dashboard (constitution §2, §3.5) — does the whole book of work pull its weight?
 * Leads with the "this month" pulse (the engine's aggregate profit-per-hour across active jobs +
 * shortfall + verdict), then ranks each job worst-first with its own profit-per-hour and signal.
 * Every number comes from the engine; the color is always paired with text.
 */
export default async function DashboardPage() {
  const session = await getServerSession();

  if (session.status !== "ready") {
    return (
      <section>
        <h1 className="text-xl font-semibold">Dashboard</h1>
        <p className="mt-2 text-sm text-muted">
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
        <p className="text-sm text-ink-soft">
          Finish your business setup so we can measure each job against your year.
        </p>
        <Link
          href="/onboarding"
          className="inline-block rounded-xl bg-brand px-4 py-2 text-base font-semibold text-brand-ink"
        >
          Set up your business
        </Link>
      </section>
    );
  }

  const rates = businessRates(settings);
  const [business, feed, projects] = await Promise.all([
    tenantDb.getBusiness(),
    tenantDb.listActiveEstimatesWithLines(),
    tenantDb.listProjects(),
  ]);
  const nameById = new Map(projects.map((p) => [p.id, p.clientName]));

  // Compute each active estimate's roll-up; keep each job's own profit/hr + signal for its card.
  const jobs: PortfolioJobInput[] = [];
  const ephById = new Map<string, Computed<CentsPerHour>>();
  const signalById = new Map<string, Computed<AbsoluteSignal>>();
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
    ephById.set(estimate.projectId, rollUp.eph);
    signalById.set(estimate.projectId, estimateSignal(rollUp, rates.targetProfitPerHour));
  }

  const pulse = portfolioPulse(jobs, rates.targetProfitPerHour);
  const ranked = buildPortfolio(jobs, {
    annualBillableHours: rates.annualBillableHours,
    grossProfitGoal: rates.grossProfitGoal,
  });
  const jobList = projects.map((p) => ({ id: p.id, name: p.clientName }));

  return (
    <section className="space-y-5">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-semibold">{business?.name ?? "Your business"}</h1>
          <p className="text-sm text-muted">
            {jobs.length} active {jobs.length === 1 ? "job" : "jobs"}
          </p>
        </div>
        <DashboardCapture jobs={jobList} />
      </div>

      {pulse.ok ? (
        <PulseCard pulse={pulse.value} />
      ) : (
        <Card>
          <div className="text-xs font-semibold uppercase tracking-wide text-muted">This month</div>
          <p className="mt-2 text-sm text-ink-soft">
            Once your active jobs have crew hours on them, your month&apos;s profit per hour shows up
            here.
          </p>
        </Card>
      )}

      <div>
        <SectionHeader title="Active jobs" action="Worst first" />
        {ranked.length === 0 ? (
          <EmptyState
            title="No active estimates yet"
            body="Open a job, build an estimate, and mark a version active to rank it here."
            action={
              <Link
                href="/projects"
                className="inline-block rounded-xl bg-brand px-4 py-2 font-semibold text-brand-ink"
              >
                + New job
              </Link>
            }
          />
        ) : (
          <ul className="space-y-2.5">
            {ranked.map((job) => {
              const eph = ephById.get(job.projectId);
              const sig = signalById.get(job.projectId);
              return (
                <li key={job.projectId}>
                  <Link href={`/projects/${job.projectId}`} className="block">
                    <Card>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate font-semibold text-ink">{job.projectName}</div>
                          <div className="mt-0.5 text-sm text-muted">{jobSubtext(job.signal)}</div>
                        </div>
                        <div className="shrink-0 whitespace-nowrap text-right">
                          <span className="text-lg font-bold tabular-nums text-ink">
                            {eph?.ok ? formatCents(eph.value) : "—"}
                          </span>
                          <span className="text-xs font-semibold text-muted">/hr</span>
                        </div>
                      </div>
                      <div className="mt-2.5">
                        {sig?.ok ? (
                          <SignalBadge color={sig.value.color} size="sm" />
                        ) : (
                          <SignalUnknown size="sm" label="Add hours to rank" />
                        )}
                      </div>
                    </Card>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}

/** The "this month" pulse card: aggregate profit/hr, verdict, progress, and drillable inputs. */
function PulseCard({ pulse }: { pulse: PortfolioPulse }) {
  const pct = Math.max(
    0,
    Math.min(100, Math.round((pulse.aggregateProfitPerHour / pulse.targetProfitPerHour) * 100)),
  );
  const per = formatCents(pulse.aggregateProfitPerHour);
  const target = formatCents(pulse.targetProfitPerHour);
  const verdict =
    pulse.shortfallPerHour <= 0
      ? `Your crew hours are earning ${per} an hour — beating your ${target} target. Keep it up.`
      : `Your crew hours are earning ${per} an hour — about ${formatCents(pulse.shortfallPerHour)} short of the ${target} you need.`;

  return (
    <Card>
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted">This month</span>
        <SignalBadge color={pulse.signal.color} />
      </div>
      <div className="mt-3 flex items-baseline gap-1.5">
        <span className="text-4xl font-bold tabular-nums tracking-tight text-ink">{per}</span>
        <span className="text-base font-semibold text-muted">/hr</span>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-ink-soft">{verdict}</p>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-line">
        <div className="h-full rounded-full bg-brand" style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-1.5 flex justify-between text-xs text-muted">
        <span>{pct}% of target</span>
        <span>
          {pulse.totalLaborHours} crew {pulse.totalLaborHours === 1 ? "hour" : "hours"}
        </span>
      </div>
      <details className="mt-3 border-t border-line-soft pt-2">
        <summary className="cursor-pointer text-sm text-muted">The inputs</summary>
        <div className="mt-1">
          <StatRow label="Net profit, active jobs" value={formatCents(pulse.totalNetProfit)} />
          <StatRow label="Crew hours booked" value={`${pulse.totalLaborHours} hrs`} />
          <StatRow label="Target profit per hour" value={`${target}/hr`} />
          <StatRow
            label="Shortfall per hour"
            value={pulse.shortfallPerHour > 0 ? `−${formatCents(pulse.shortfallPerHour)}` : "—"}
          />
        </div>
        <p className="mt-1 text-xs text-muted">Net profit ÷ crew hours across every active job.</p>
      </details>
    </Card>
  );
}

/** Plain-language "% of year / % of profit goal" for a ranked job (from the comparative signal). */
function jobSubtext(signal: Computed<ComparativeSignal>): string {
  if (!signal.ok) return "Add labor hours to rank this job.";
  return `${pct1(signal.value.percentOfYear)} of your year · ${pct2(signal.value.percentOfProfitGoal)} of your profit goal`;
}

/** Format a computed ratio as a percent with one decimal ("0.0533" → "5.3%"). */
function pct1(r: Computed<Ratio>): string {
  return r.ok ? `${(r.value * 100).toFixed(1)}%` : "—";
}

/** Format a computed ratio as a percent with two decimals ("0.100463" → "10.05%"). */
function pct2(r: Computed<Ratio>): string {
  return r.ok ? `${(r.value * 100).toFixed(2)}%` : "—";
}
