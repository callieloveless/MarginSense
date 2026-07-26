import Link from "next/link";
import { getServerSession, tenantDbForSession } from "@/src/db/session";
import type { ProjectRow } from "@/src/db/schema";

/**
 * Projects list (constitution §2 outer layer). Lists this business's jobs through the
 * tenant-scoped handle — another tenant's projects can never appear. Estimates, context,
 * and the profit signal attach to a project in later changes.
 */
export default async function ProjectsPage() {
  const session = await getServerSession();

  let projects: ProjectRow[] = [];
  let live = false;
  if (session.status === "ready") {
    projects = await tenantDbForSession(session.authUserId, session.businessId).listProjects();
    live = true;
  }

  return (
    <section>
      <h1 className="text-xl font-semibold">Jobs</h1>
      <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
        One job per client — the home for its estimates and shared context.
      </p>

      <Link
        href="/projects/new"
        className="mt-4 block rounded-xl bg-brand px-4 py-3 text-center text-base font-semibold text-brand-ink"
      >
        + New job
      </Link>

      <ul className="mt-6 divide-y divide-neutral-200 dark:divide-neutral-800">
        {projects.length === 0 ? (
          <li className="py-3 text-sm text-neutral-500">
            {live ? "No jobs yet — add your first job above." : "Connect Supabase to load jobs."}
          </li>
        ) : (
          projects.map((p) => (
            <li key={p.id} className="py-3">
              <Link href={`/projects/${p.id}`} className="flex items-center justify-between">
                <span className="font-medium">{p.clientName}</span>
                <span className="text-xs uppercase tracking-wide text-neutral-500">
                  {p.status}
                </span>
              </Link>
              {p.address ? (
                <p className="text-xs text-neutral-500">{p.address}</p>
              ) : null}
            </li>
          ))
        )}
      </ul>
    </section>
  );
}
