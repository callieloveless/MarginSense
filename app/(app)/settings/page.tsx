import Link from "next/link";
import { getServerSession, tenantDbForSession } from "@/src/db/session";
import type { BusinessSettingsRow } from "@/src/db/schema";
import { DerivedRates } from "@/app/_components/derived-rates";
import { SettingsForm } from "./settings-form";

/**
 * Business settings (constitution §3.2 outer layer). Shows the derived-rate playback (the
 * engine recomputes it from the stored inputs — §6.8) above an editable form for every
 * input. When nothing is saved yet it points to the onboarding wizard. Inputs only are
 * stored; the rates here are never persisted.
 */
export default async function SettingsPage() {
  const session = await getServerSession();

  if (session.status !== "ready") {
    return (
      <section className="space-y-2">
        <h1 className="text-xl font-semibold text-ink">Settings</h1>
        <p className="rounded-xl bg-surface px-3 py-2 text-sm text-muted">
          {session.status === "unconfigured"
            ? "Connect Supabase to save your business settings."
            : "Sign in to manage your business settings."}
        </p>
      </section>
    );
  }

  const tenantDb = tenantDbForSession(session.authUserId, session.businessId);
  const settings = await tenantDb.getSettings();

  if (!settings) {
    return (
      <section className="space-y-3">
        <h1 className="text-xl font-semibold text-ink">Settings</h1>
        <p className="text-sm text-ink-soft">
          Finish setting up your business — overhead, wage, capacity, and goals — so the profit math
          has what it needs.
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

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-ink">Your numbers</h1>
        <p className="mt-1 text-sm text-muted">
          Derived from your inputs — tap any line to see how. Recomputed every time; never stored.
        </p>
        <div className="mt-3">
          <DerivedRates settings={settings} />
        </div>
      </div>

      <div>
        <h2 className="text-lg font-semibold text-ink">Edit your inputs</h2>
        <p className="mb-3 mt-1 text-sm text-muted">
          Change any value and save — your numbers above update.
        </p>
        <SettingsForm initial={rowToFormValues(settings)} />
      </div>

      <Link
        href="/onboarding"
        className="block rounded-xl border border-line px-4 py-3 text-center text-base font-semibold text-ink"
      >
        Replay setup
      </Link>
    </section>
  );
}

/** Cents → a plain dollar string ("6000000" → "60000"). */
function dollars(cents: number): string {
  return String(cents / 100);
}

/** A stored settings row → the form's human-string field values (inputs only). */
function rowToFormValues(row: BusinessSettingsRow): Record<string, string> {
  return {
    annualOverhead: dollars(row.annualOverheadCents),
    ownerWage: dollars(row.ownerWageCentsPerHour),
    laborBurden: String(row.laborBurdenBp / 100),
    workingDaysPerYear: String(row.workingDaysPerYear),
    billableHoursPerDay: String(row.billableMinutesPerDay / 60),
    incomeGoal: dollars(row.incomeGoalCents),
    profitTarget: dollars(row.profitTargetCents),
    targetMargin: String(row.targetMarginBp / 100),
    defaultContingency: String(row.defaultContingencyBp / 100),
    defaultMarkup: row.defaultMarkupBp === null ? "" : String(row.defaultMarkupBp / 100),
    defaultTaxRate: row.defaultTaxRateBp === null ? "" : String(row.defaultTaxRateBp / 100),
    serviceArea: row.serviceArea ?? "",
  };
}
