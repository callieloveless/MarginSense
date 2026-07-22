import Link from "next/link";
import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getServerSession } from "@/src/db/session";

/**
 * The authenticated shell (constitution §2 outer layer). Resolves the session + tenant
 * server-side and gates access: signed-out → sign-in, signed-in-without-a-business →
 * create-business. Before Supabase is configured it renders an "unconfigured" banner so
 * the phone-first skeleton is still walkable.
 */
export default async function AppLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = await getServerSession();

  if (session.status === "signed-out") redirect("/sign-in");
  if (session.status === "no-business") redirect("/create-business");

  const unconfigured = session.status === "unconfigured";

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col">
      <header className="flex items-center justify-between border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
        <Link href="/dashboard" className="text-lg font-semibold">
          MarginSense
        </Link>
        <span className="text-xs text-neutral-500">Profit Tracker</span>
      </header>

      {unconfigured ? (
        <div className="mx-4 mt-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          Supabase isn&apos;t connected yet. Set the values in{" "}
          <code>.env.local</code> (see <code>.env.example</code>) to enable auth and data.
          Screens below are skeletons.
        </div>
      ) : null}

      <main className="flex-1 px-4 py-4">{children}</main>

      <nav className="sticky bottom-0 grid grid-cols-3 border-t border-neutral-200 bg-white text-center text-sm dark:border-neutral-800 dark:bg-neutral-950">
        <Link href="/dashboard" className="py-3">
          Dashboard
        </Link>
        <Link href="/projects" className="py-3">
          Projects
        </Link>
        <Link href="/settings" className="py-3">
          Settings
        </Link>
      </nav>
    </div>
  );
}
