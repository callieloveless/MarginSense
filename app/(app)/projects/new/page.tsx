import Link from "next/link";
import { getServerSession } from "@/src/db/session";
import { NewJobWizard } from "./new-job-wizard";

/**
 * New-job setup (revamp-project-setup). The (app) layout already gates signed-out / no-business;
 * here we only guard the unconfigured backend, then hand off to the two-step wizard.
 */
export default async function NewJobPage() {
  const session = await getServerSession();

  if (session.status !== "ready") {
    return (
      <section className="space-y-3">
        <Link href="/projects" className="text-sm text-muted">
          ← Jobs
        </Link>
        <h1 className="text-xl font-semibold text-ink">New job</h1>
        <p className="rounded-xl border border-notice-line bg-notice-bg px-3 py-2 text-sm text-notice-fg">
          {session.status === "unconfigured"
            ? "Connect Supabase to create a job."
            : "Sign in to create a job."}
        </p>
      </section>
    );
  }

  return <NewJobWizard />;
}
