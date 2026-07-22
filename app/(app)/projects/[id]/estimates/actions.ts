"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getServerSession, tenantDbForSession } from "@/src/db/session";
import { dollarsToCents, parseLineItems, percentToBp } from "@/src/db/validation";

export type EstimateActionResult = { ok: true; message?: string } | { ok: false; error: string };

function field(formData: FormData, name: string): string {
  const v = formData.get(name);
  return typeof v === "string" ? v : "";
}

/**
 * Create a new estimate version for a project. Target margin and contingency default from
 * the business settings (constitution §3.2/§3.4); the first version for a project becomes
 * active. Redirects to the new estimate. The `business_id` is resolved from the session.
 */
export async function createEstimateAction(
  projectId: string,
  formData: FormData,
): Promise<EstimateActionResult> {
  const session = await getServerSession();
  if (session.status !== "ready") {
    return { ok: false, error: "Connect Supabase and sign in to build estimates." };
  }
  const tenantDb = tenantDbForSession(session.authUserId, session.businessId);

  const settings = await tenantDb.getSettings();
  if (!settings) {
    return { ok: false, error: "Finish your business setup (Settings) before adding estimates." };
  }

  const versionLabel = field(formData, "versionLabel").trim() || "v1";
  const existing = await tenantDb.listEstimates(projectId);
  const isFirst = existing.length === 0;

  const estimate = await tenantDb.createEstimate({
    projectId,
    versionLabel,
    targetMarginBp: settings.targetMarginBp,
    contingencyBp: settings.defaultContingencyBp,
    isActive: isFirst, // first version is the active one
  });

  // Creating an estimate seeds the project's shared context (constitution §4): the first
  // version records a `fact` so the "one job, one memory" thread reflects the job's estimate.
  if (isFirst) {
    await tenantDb.addContextEntry({
      projectId,
      kind: "fact",
      payload: {
        label: "Estimate started",
        value: `Version "${versionLabel}" — cost and hour data fill in as line items are added.`,
      },
    });
  }

  revalidatePath(`/projects/${projectId}`);
  redirect(`/projects/${projectId}/estimates/${estimate.id}`);
}

/**
 * Save an estimate's pricing inputs (target margin, contingency, optional total-price
 * override) and its line items in one go. Costs are entered; the price/margin are recomputed
 * by the engine when the estimate is displayed (constitution §6.8) — nothing derived is
 * stored beyond a deliberate override.
 */
export async function saveEstimateAction(
  estimateId: string,
  projectId: string,
  formData: FormData,
): Promise<EstimateActionResult> {
  const session = await getServerSession();
  if (session.status !== "ready") {
    return { ok: false, error: "Connect Supabase and sign in to save estimates." };
  }
  const tenantDb = tenantDbForSession(session.authUserId, session.businessId);

  const targetMarginBp = percentToBp(field(formData, "targetMargin"));
  if (targetMarginBp === null || targetMarginBp >= 10_000) {
    return { ok: false, error: "Target margin must be a percentage under 100%." };
  }
  const contingencyBp = percentToBp(field(formData, "contingency"));
  if (contingencyBp === null || contingencyBp > 10_000) {
    return { ok: false, error: "Contingency must be a percentage between 0 and 100." };
  }

  const overrideRaw = field(formData, "totalPriceOverride").trim();
  let totalPriceOverrideCents: number | null = null;
  if (overrideRaw !== "") {
    totalPriceOverrideCents = dollarsToCents(overrideRaw);
    if (totalPriceOverrideCents === null) {
      return { ok: false, error: "Price override must be a non-negative dollar amount." };
    }
  }

  let lines: unknown = [];
  const linesJson = field(formData, "lines").trim();
  if (linesJson !== "") {
    try {
      lines = JSON.parse(linesJson);
    } catch {
      return { ok: false, error: "Line items were malformed." };
    }
  }
  const parsedLines = parseLineItems(lines);
  if (!parsedLines.ok) return { ok: false, error: parsedLines.error };

  const updated = await tenantDb.updateEstimate(estimateId, {
    targetMarginBp,
    contingencyBp,
    totalPriceOverrideCents,
  });
  if (!updated) return { ok: false, error: "That estimate no longer exists." };

  await tenantDb.saveLineItems(estimateId, parsedLines.data);

  revalidatePath(`/projects/${projectId}/estimates/${estimateId}`);
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/dashboard");
  return { ok: true, message: "Saved." };
}

/** Mark a version active/accepted — the one that feeds the portfolio (clears any other). */
export async function setActiveEstimateAction(
  projectId: string,
  estimateId: string,
): Promise<EstimateActionResult> {
  const session = await getServerSession();
  if (session.status !== "ready") {
    return { ok: false, error: "Connect Supabase and sign in." };
  }
  const tenantDb = tenantDbForSession(session.authUserId, session.businessId);
  await tenantDb.setActiveEstimate(projectId, estimateId);

  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/projects/${projectId}/estimates/${estimateId}`);
  revalidatePath("/dashboard");
  return { ok: true, message: "This version is now active." };
}
