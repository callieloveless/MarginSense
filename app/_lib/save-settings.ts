/**
 * Shared server-side persistence for the §3.2 settings, used by both the onboarding wizard
 * and full settings. Resolves the tenant from the session (never client input), converts
 * and validates the form at the boundary (Zod + the integer converters), and writes through
 * the tenant-scoped handle so `business_id` is stamped and RLS applies (constitution §6.3).
 *
 * Not a Server Action itself (no `"use server"`) — it is called *by* the action modules, so
 * it is never exposed to the client directly.
 */

import { getServerSession, tenantDbForSession } from "@/src/db/session";
import { parseOverheadItems, parseSettingsForm } from "@/src/db/validation";

export type SaveSettingsResult = { ok: true } | { ok: false; error: string };

/** Read a form field as a trimmed string ("" when absent). */
function field(formData: FormData, name: string): string {
  const v = formData.get(name);
  return typeof v === "string" ? v : "";
}

/**
 * Validate and persist the settings form for the signed-in business. Overhead itemization
 * is only touched when the form actually carries the `overheadItems` field (the wizard does;
 * a settings form that omits it leaves existing items alone).
 */
export async function saveSettingsFromForm(formData: FormData): Promise<SaveSettingsResult> {
  const session = await getServerSession();
  if (session.status !== "ready") {
    return { ok: false, error: "Connect Supabase and sign in to save your settings." };
  }

  const parsed = parseSettingsForm({
    annualOverhead: field(formData, "annualOverhead"),
    ownerWage: field(formData, "ownerWage"),
    laborBurden: field(formData, "laborBurden"),
    workingDaysPerYear: field(formData, "workingDaysPerYear"),
    billableHoursPerDay: field(formData, "billableHoursPerDay"),
    incomeGoal: field(formData, "incomeGoal"),
    profitTarget: field(formData, "profitTarget"),
    targetMargin: field(formData, "targetMargin"),
    defaultContingency: field(formData, "defaultContingency"),
    defaultMarkup: field(formData, "defaultMarkup"),
    defaultTaxRate: field(formData, "defaultTaxRate"),
    serviceArea: field(formData, "serviceArea"),
  });
  if (!parsed.ok) return { ok: false, error: parsed.error };

  const tenantDb = tenantDbForSession(session.authUserId, session.businessId);

  // Advanced defaults (markup/tax) are only editable in full Settings, which always submits them
  // (blank included, so it can clear them). A form that omits them entirely — the onboarding
  // wizard — must NOT wipe the stored values, so preserve them when neither field is present.
  let dataToSave = parsed.data;
  if (!formData.has("defaultMarkup") && !formData.has("defaultTaxRate")) {
    const current = await tenantDb.getSettings();
    dataToSave = {
      ...parsed.data,
      defaultMarkupBp: current?.defaultMarkupBp ?? null,
      defaultTaxRateBp: current?.defaultTaxRateBp ?? null,
    };
  }
  await tenantDb.saveSettings(dataToSave);

  // Optional overhead itemization — replace only when the form includes the field.
  if (formData.has("overheadItems")) {
    const rawJson = field(formData, "overheadItems").trim();
    let items: unknown = [];
    if (rawJson !== "") {
      try {
        items = JSON.parse(rawJson);
      } catch {
        return { ok: false, error: "Overhead items were malformed." };
      }
    }
    const parsedItems = parseOverheadItems(items);
    if (!parsedItems.ok) return { ok: false, error: parsedItems.error };
    await tenantDb.saveOverheadItems(parsedItems.data);
  }

  return { ok: true };
}
