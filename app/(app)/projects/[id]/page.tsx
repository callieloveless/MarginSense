import Link from "next/link";
import { notFound } from "next/navigation";
import { getServerSession, tenantDbForSession } from "@/src/db/session";
import { SignalBadge } from "@/app/_components/signal-badge";
import { NewEstimateForm } from "./new-estimate";

/**
 * Project detail (constitution §2) — the home for a job's estimate versions (and, in later
 * changes, its shared context, conversation, and tools). Reads through the tenant-scoped
 * handle; a project belonging to another business resolves to not-found.
 */
export default async function ProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getServerSession();

  if (session.status !== "ready") {
    return (
      <section>
        <Link href="/projects" className="text-sm text-neutral-500">
          ← Projects
        </Link>
        <p className="mt-4 text-sm text-neutral-500">
          Connect Supabase and sign in to view this project.
        </p>
      </section>
    );
  }

  const tenantDb = tenantDbForSession(session.authUserId, session.businessId);
  const project = await tenantDb.getProject(id);
  if (!project) notFound();

  const estimates = await tenantDb.listEstimates(id);

  return (
    <section>
      <Link href="/projects" className="text-sm text-neutral-500">
        ← Projects
      </Link>
      <h1 className="mt-2 text-xl font-semibold">{project.clientName}</h1>
      <p className="text-xs uppercase tracking-wide text-neutral-500">{project.status}</p>
      {project.address ? (
        <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">{project.address}</p>
      ) : null}
      {project.scope ? (
        <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">{project.scope}</p>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <Link
          href={`/projects/${id}/context`}
          className="inline-flex items-center gap-1 rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium dark:border-neutral-700"
        >
          Job context &amp; suggestions →
        </Link>
        <Link
          href={`/projects/${id}/tools`}
          className="inline-flex items-center gap-1 rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium dark:border-neutral-700"
        >
          Tools →
        </Link>
        <Link
          href={`/projects/${id}/documents`}
          className="inline-flex items-center gap-1 rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium dark:border-neutral-700"
        >
          Client documents →
        </Link>
      </div>

      <div className="mt-6">
        <h2 className="text-lg font-semibold">Estimates</h2>
        <p className="mt-1 mb-3 text-sm text-neutral-500">
          Build a version to see whether the job pulls its weight. The active version feeds
          your dashboard.
        </p>
        <NewEstimateForm projectId={id} disabled={false} />

        <ul className="mt-4 divide-y divide-neutral-200 dark:divide-neutral-800">
          {estimates.length === 0 ? (
            <li className="py-3 text-sm text-neutral-500">No estimates yet — add your first version above.</li>
          ) : (
            estimates.map((e) => (
              <li key={e.id} className="py-3">
                <Link href={`/projects/${id}/estimates/${e.id}`} className="flex items-center justify-between gap-3">
                  <span className="font-medium">{e.versionLabel}</span>
                  {e.isActive ? (
                    <SignalBadge color="green" label="Active" />
                  ) : (
                    <span className="text-xs text-neutral-500">draft</span>
                  )}
                </Link>
              </li>
            ))
          )}
        </ul>
      </div>
    </section>
  );
}
