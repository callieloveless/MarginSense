import Link from "next/link";
import { notFound } from "next/navigation";
import { getServerSession, tenantDbForBusiness } from "@/src/db/session";

/**
 * Project detail (constitution §2) — the home a job's estimates, shared context, one
 * conversation, and tools will attach to in later changes. Reads through the
 * tenant-scoped handle; a project belonging to another business resolves to not-found.
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

  const project = await tenantDbForBusiness(session.businessId).getProject(id);
  if (!project) notFound();

  return (
    <section>
      <Link href="/projects" className="text-sm text-neutral-500">
        ← Projects
      </Link>
      <h1 className="mt-2 text-xl font-semibold">{project.clientName}</h1>
      <p className="text-xs uppercase tracking-wide text-neutral-500">{project.status}</p>
      {project.address ? (
        <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
          {project.address}
        </p>
      ) : null}
      {project.scope ? (
        <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
          {project.scope}
        </p>
      ) : null}

      <div className="mt-6 rounded-md bg-neutral-100 px-3 py-2 text-xs text-neutral-500 dark:bg-neutral-900">
        Estimates, shared context, and tools attach here in later changes.
      </div>
    </section>
  );
}
