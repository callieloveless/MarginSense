"use server";

import { redirect } from "next/navigation";
import { saveSettingsFromForm } from "@/app/_lib/save-settings";

export type OnboardingResult = { ok: false; error: string };

/**
 * Persist the onboarding wizard and continue to Review. On success this redirects (so no
 * success value is returned); on failure it returns the error for inline display. The
 * business is resolved from the session — the form never carries a `business_id`.
 */
export async function completeOnboardingAction(
  formData: FormData,
): Promise<OnboardingResult> {
  const result = await saveSettingsFromForm(formData);
  if (!result.ok) return { ok: false, error: result.error };
  redirect("/onboarding/review");
}
