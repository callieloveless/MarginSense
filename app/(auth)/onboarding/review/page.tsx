import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession, tenantDbForSession } from "@/src/db/session";
import { DerivedRates } from "@/app/_components/derived-rates";

/**
 * Onboarding Review (constitution §3.3, §6.6). Plays back the rates the engine derives from
 * the just-saved inputs — overhead recovery, burdened rate, loaded cost, break-even day,
 * gross-profit goal, target profit/hr — each drillable to its inputs. Nothing derived is
 * stored; it is recomputed here on every view (constitution §6.8).
 */
export default async function OnboardingReviewPage() {
  const session = await getServerSession();

  if (session.status === "signed-out") redirect("/sign-in");
  if (session.status === "no-business") redirect("/create-business");
  if (session.status === "unconfigured") redirect("/onboarding");

  const tenantDb = tenantDbForSession(session.authUserId, session.businessId);
  const settings = await tenantDb.getSettings();

  // No settings yet → back to the wizard.
  if (!settings) redirect("/onboarding");

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-ink">Here are your numbers</h1>
        <p className="mt-1 text-sm text-ink-soft">
          Computed from what you entered — tap any line to see the inputs behind it. These recompute
          whenever you change your settings; they&apos;re never stored.
        </p>
      </div>

      <DerivedRates settings={settings} />

      <div className="flex gap-2 pt-2">
        <Link
          href="/onboarding"
          className="flex-1 rounded-xl border border-line px-3 py-3 text-center text-base font-semibold text-ink"
        >
          Edit inputs
        </Link>
        <Link
          href="/dashboard"
          className="flex-1 rounded-xl bg-brand px-3 py-3 text-center text-base font-semibold text-brand-ink"
        >
          Go to dashboard
        </Link>
      </div>
    </div>
  );
}
