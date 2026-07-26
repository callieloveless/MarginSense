import Link from "next/link";
import { notFound } from "next/navigation";
import { getServerSession, tenantDbForSession } from "@/src/db/session";
import { loadJobProfit, previewForSuggestion } from "@/app/_lib/job-profit";
import { documentBadge, jobSubline, photoBadge } from "@/app/_lib/job-summary";
import { ProfitHeader } from "@/app/_components/profit-header";
import { SuggestionCard } from "@/app/_components/suggestion-card";
import { SectionHeader } from "@/app/_components/ui";
import { ActivityFeed, ToolsGrid } from "./hub-sections";
import { NewEstimateForm } from "./new-estimate";
import { acceptSuggestionAction, dismissSuggestionAction } from "./context/actions";

/**
 * The job hub (constitution §2; revamp-project-hub) — a job's default command-center surface. It
 * composes, on one screen, the active estimate's profit-per-hour signal (the red/yellow/green the
 * product turns on), the "Waiting on you" pending-suggestion queue, a grid of the tools that exist,
 * a compact activity feed, and the estimate versions. Presentation over existing capabilities: every
 * read goes through the tenant-scoped handle (another business's job resolves to not-found) and the
 * only mutation is the already-specified accept/dismiss of a suggestion (§5).
 */
export default async function ProjectHubPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getServerSession();

  if (session.status !== "ready") {
    return (
      <section className="space-y-3">
        <Link href="/projects" className="text-sm text-muted">
          ← Jobs
        </Link>
        <p className="rounded-xl border border-notice-line bg-notice-bg px-3 py-2 text-sm text-notice-fg">
          {session.status === "unconfigured"
            ? "Connect Supabase to view this job."
            : "Sign in to view this job."}
        </p>
      </section>
    );
  }

  const tenantDb = tenantDbForSession(session.authUserId, session.businessId);
  const project = await tenantDb.getProject(id);
  if (!project) notFound();

  // One pass through the bound handle — the hero, the queue, the tools badges, the feed, and the
  // versions all read here so a single job open is one round of reads.
  const storageReady = tenantDb.hasPhotoStorage;
  const [job, estimates, pending, entries, messages, photos, documents] = await Promise.all([
    loadJobProfit(tenantDb, id),
    tenantDb.listEstimates(id),
    tenantDb.listPendingSuggestions(id),
    tenantDb.listContextEntries(id),
    tenantDb.listMessages(id),
    storageReady ? tenantDb.listPhotos(id) : Promise.resolve([]),
    tenantDb.listDocuments(id),
  ]);

  const subline = jobSubline(project);

  return (
    <section>
      <Link href="/projects" className="text-sm text-muted">
        ← Jobs
      </Link>
      <h1 className="mt-2 text-xl font-semibold text-ink">{project.clientName}</h1>
      {subline ? <p className="mt-1 text-sm text-muted">{subline}</p> : null}

      {/* Profit-per-hour hero — the signal the whole product turns on; absent-safe with no estimate. */}
      <div className="mt-4">
        <ProfitHeader job={job} projectId={id} />
      </div>

      {/* Waiting on you — the pending queue, triaged here (same durable queue as the job memory). */}
      <section className="mt-6">
        <SectionHeader title="Waiting on you" />
        {pending.length === 0 ? (
          <p className="rounded-2xl border border-line bg-surface px-3 py-2 text-sm text-muted">
            Nothing waiting. When a tool proposes a material, finding, or line item, it lands here for
            you to confirm.
          </p>
        ) : (
          <ul className="space-y-2">
            {pending.map((s) => (
              <SuggestionCard
                key={s.id}
                suggestion={s}
                preview={previewForSuggestion(s, job)}
                accept={acceptSuggestionAction.bind(null, id, s.id)}
                dismiss={dismissSuggestionAction.bind(null, id, s.id)}
              />
            ))}
          </ul>
        )}
      </section>

      {/* Tools — only surfaces that exist today, with honest badges. */}
      <section className="mt-6">
        <SectionHeader title="Tools" />
        <ToolsGrid
          projectId={id}
          photoBadge={photoBadge(storageReady, photos.length)}
          docBadge={documentBadge(documents)}
        />
      </section>

      <ActivityFeed projectId={id} entries={entries} messages={messages} />

      {/* Estimates — the versions and the create action stay, so nothing the prior page did is lost. */}
      <section className="mt-6">
        <SectionHeader title="Estimates" />
        <p className="mb-3 text-sm text-muted">
          Build a version to see whether the job pulls its weight. The active version feeds your
          dashboard.
        </p>
        <NewEstimateForm projectId={id} disabled={false} />

        <ul className="mt-4 divide-y divide-line">
          {estimates.length === 0 ? (
            <li className="py-3 text-sm text-muted">No estimates yet — add your first version above.</li>
          ) : (
            estimates.map((e) => (
              <li key={e.id} className="py-3">
                <Link
                  href={`/projects/${id}/estimates/${e.id}`}
                  className="flex items-center justify-between gap-3"
                >
                  <span className="font-medium text-ink">{e.versionLabel}</span>
                  {e.isActive ? (
                    <span className="shrink-0 rounded-full bg-brand-soft px-2 py-0.5 text-xs font-medium text-ink">
                      Active
                    </span>
                  ) : (
                    <span className="text-xs text-muted">draft</span>
                  )}
                </Link>
              </li>
            ))
          )}
        </ul>
      </section>
    </section>
  );
}
