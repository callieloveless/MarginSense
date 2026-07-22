/**
 * Portfolio dashboard (constitution §2, §3.5) — the "does the whole book of work pull its
 * weight" view. The red/yellow/green portfolio math and per-job "% of your year" arrive in
 * `add-estimate-dashboard`; this foundation renders the shell so navigation and tenancy are
 * real first.
 */
export default function DashboardPage() {
  return (
    <section>
      <h1 className="text-xl font-semibold">Dashboard</h1>
      <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
        Your portfolio&apos;s red / yellow / green signal will live here — each job ranked by
        whether the profit it earns justifies the crew hours it eats.
      </p>
      <p className="mt-4 rounded-md bg-neutral-100 px-3 py-2 text-xs text-neutral-500 dark:bg-neutral-900">
        Coming in the estimate + dashboard change. Set up your business in Settings and add
        a project to get started.
      </p>
    </section>
  );
}
