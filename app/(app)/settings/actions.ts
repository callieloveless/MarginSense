"use server";

import { revalidatePath } from "next/cache";
import { saveSettingsFromForm } from "@/app/_lib/save-settings";

export type SettingsActionResult =
  | { ok: true; message: string }
  | { ok: false; error: string };

/**
 * Save the full settings form (all §3.2 inputs plus the advanced markup/tax). Reuses the
 * shared tenant-scoped persistence; on success revalidates so the derived-rate playback
 * on the page recomputes from the new inputs (constitution §6.8).
 */
export async function saveSettingsAction(formData: FormData): Promise<SettingsActionResult> {
  const result = await saveSettingsFromForm(formData);
  if (!result.ok) return { ok: false, error: result.error };
  revalidatePath("/settings");
  return { ok: true, message: "Saved. Your numbers below are up to date." };
}
