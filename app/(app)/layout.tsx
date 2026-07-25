import Link from "next/link";
import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getServerSession } from "@/src/db/session";
import { NavTabs } from "@/app/_components/nav-tabs";

/**
 * The authenticated shell (constitution §2 outer layer). Resolves the session + tenant
 * server-side and gates access: signed-out → sign-in, signed-in-without-a-business →
 * create-business. Before Supabase is configured it renders an "unconfigured" notice so the
 * phone-first skeleton is still walkable. The frame (paper theme, header, bottom tabs) is the
 * revamp shell; each screen owns its own content.
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
    <div className="mx-auto flex min-h-dvh max-w-md flex-col bg-paper text-ink">
      <header className="flex items-center justify-between border-b border-line px-4 py-3">
        <Link href="/dashboard" className="text-lg font-semibold text-brand">
          MarginSense
        </Link>
        <span className="text-xs text-muted">Profit Tracker</span>
      </header>

      {unconfigured ? (
        <div className="mx-4 mt-3 rounded-xl border border-notice-line bg-notice-bg px-3 py-2 text-sm text-notice-fg">
          Supabase isn&apos;t connected yet. Set the values in <code>.env.local</code> (see{" "}
          <code>.env.example</code>) to enable auth and data. Screens below are skeletons.
        </div>
      ) : null}

      <main className="flex-1 px-4 py-4">{children}</main>

      <NavTabs />
    </div>
  );
}
