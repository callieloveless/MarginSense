import { redirect } from "next/navigation";
import { getServerSession, tenantDbForSession } from "@/src/db/session";
import type { BusinessSettingsRow } from "@/src/db/schema";
import { OnboardingWizard } from "./wizard";

/**
 * Onboarding entry (constitution §3.2). Requires a signed-in user with a business (the
 * create-business step runs first). Prefills the wizard from any existing settings so it
 * doubles as "redo setup". Before Supabase is configured it shows a connect notice.
 */
export default async function OnboardingPage() {
  const session = await getServerSession();

  if (session.status === "signed-out") redirect("/sign-in");
  if (session.status === "no-business") redirect("/create-business");

  if (session.status === "unconfigured") {
    return (
      <div className="space-y-3">
        <h1 className="text-xl font-semibold">Set up your business</h1>
        <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          Connect Supabase (see <code>.env.example</code>) to save your overhead, wage, and
          goals.
        </p>
      </div>
    );
  }

  const tenantDb = tenantDbForSession(session.authUserId, session.businessId);
  const existing = await tenantDb.getSettings();
  const items = existing ? await tenantDb.listOverheadItems() : [];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Set up your business</h1>
        <p className="mt-1 text-sm text-neutral-500">
          A few numbers so MarginSense can tell you whether a job is worth the hours. You can
          change any of these later in Settings.
        </p>
      </div>
      <OnboardingWizard
        initial={existing ? rowToFormValues(existing) : undefined}
        initialItems={items.map((i) => ({ name: i.name, amount: dollars(i.amountCents) }))}
      />
    </div>
  );
}

/** Cents → a plain dollar string ("6000000" → "60000", "3550" → "35.5"). */
function dollars(cents: number): string {
  return String(cents / 100);
}

/** A stored settings row → the wizard's human-string field values (inputs only). */
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
  };
}
