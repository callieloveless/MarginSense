"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getServerSession, tenantDbForSession } from "@/src/db/session";
import { dollarsToCents, parseLineItems, percentToBp } from "@/src/db/validation";
import type { LineItemInput } from "@/src/db/tenant";
import { computeEstimate, type StoredEstimate } from "@/src/estimate";
import { businessRates } from "@/app/_lib/estimate-compute";
import { estimateComputationToDTO, type EstimateDTO } from "@/app/_lib/estimate-dto";
import { duplicateEstimate, lineSetChanged } from "@/app/_lib/estimate-edit";
import { seedEstimatePricing } from "@/app/_lib/estimate-seed";

export type EstimateActionResult = { ok: true; message?: string } | { ok: false; error: string };

function field(formData: FormData, name: string): string {
  const v = formData.get(name);
  return typeof v === "string" ? v : "";
}

/** Parse a JSON array of ids from a form field; null when absent/blank/malformed (skip the check). */
function parseIdList(raw: string): string[] | null {
  const s = raw.trim();
  if (s === "") return null;
  try {
    const arr: unknown = JSON.parse(s);
    return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === "string") : null;
  } catch {
    return null;
  }
}

/** The estimate editor's pricing inputs, parsed once and shared by save and preview so the two
 * can never disagree about what a form means. Costs/prices are inputs; the roll-up is derived. */
interface EstimateInputs {
  targetMarginBp: number;
  contingencyBp: number;
  totalPriceOverrideCents: number | null;
  lines: LineItemInput[];
}

function parseEstimateInputs(
  formData: FormData,
): ({ ok: true } & EstimateInputs) | { ok: false; error: string } {
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

  let raw: unknown = [];
  const linesJson = field(formData, "lines").trim();
  if (linesJson !== "") {
    try {
      raw = JSON.parse(linesJson);
    } catch {
      return { ok: false, error: "Line items were malformed." };
    }
  }
  const parsedLines = parseLineItems(raw);
  if (!parsedLines.ok) return { ok: false, error: parsedLines.error };

  return { ok: true, targetMarginBp, contingencyBp, totalPriceOverrideCents, lines: parsedLines.data };
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
  const [existing, project] = await Promise.all([
    tenantDb.listEstimates(projectId),
    tenantDb.getProject(projectId),
  ]);
  const isFirst = existing.length === 0;

  // Seed margin/contingency from the project's per-job defaults when set, else the business
  // default (revamp-project-setup). A seed, not a link — copied onto the estimate now.
  const seed = seedEstimatePricing(project, settings);

  const estimate = await tenantDb.createEstimate({
    projectId,
    versionLabel,
    targetMarginBp: seed.targetMarginBp,
    contingencyBp: seed.contingencyBp,
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

  const inputs = parseEstimateInputs(formData);
  if (!inputs.ok) return inputs;

  // Reconcile against a concurrent change (constitution §5; a tool suggestion accepted while the
  // editor was open adds a line). A full-replace save must not silently drop it: if the server's
  // line set changed since the editor loaded, surface it instead of overwriting.
  const baseLineIds = parseIdList(field(formData, "baseLineIds"));
  if (baseLineIds !== null) {
    const current = await tenantDb.getLineItems(estimateId);
    if (lineSetChanged(baseLineIds, current.map((l) => l.id))) {
      return {
        ok: false,
        error: "A line changed on this estimate since you opened it (a tool may have added one). Reload to review before saving.",
      };
    }
  }

  const updated = await tenantDb.updateEstimate(estimateId, {
    targetMarginBp: inputs.targetMarginBp,
    contingencyBp: inputs.contingencyBp,
    totalPriceOverrideCents: inputs.totalPriceOverrideCents,
  });
  if (!updated) return { ok: false, error: "That estimate no longer exists." };

  await tenantDb.saveLineItems(estimateId, inputs.lines);

  revalidatePath(`/projects/${projectId}/estimates/${estimateId}`);
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/dashboard");
  return { ok: true, message: "Saved." };
}

export type EstimatePreviewResult = { ok: true; dto: EstimateDTO } | { ok: false; error: string };

/**
 * Recompute an estimate from the editor's **in-progress** inputs without persisting anything — the
 * engine-truthful live preview (constitution §6; the client never re-implements the math). Same
 * parsing as save; tenant-scoped (a foreign estimate id resolves to "no longer exists"). Returns a
 * plain "can't price yet" error the editor renders as a hint, never a thrown 500 on half-typed input.
 */
export async function previewEstimateAction(
  estimateId: string,
  formData: FormData,
): Promise<EstimatePreviewResult> {
  const session = await getServerSession();
  if (session.status !== "ready") return { ok: false, error: "Sign in to price this estimate." };
  const tenantDb = tenantDbForSession(session.authUserId, session.businessId);

  const inputs = parseEstimateInputs(formData);
  if (!inputs.ok) return inputs;

  const [settings, estimate] = await Promise.all([
    tenantDb.getSettings(),
    tenantDb.getEstimate(estimateId),
  ]);
  if (!estimate) return { ok: false, error: "That estimate no longer exists." };
  if (!settings) return { ok: false, error: "Finish your business setup to price this estimate." };

  const rates = businessRates(settings);
  if (!rates.overheadRecoveryRate.ok) {
    return { ok: false, error: "Add working days and billable hours in Settings to price this." };
  }

  const stored: StoredEstimate = {
    targetMarginBp: inputs.targetMarginBp,
    contingencyBp: inputs.contingencyBp,
    totalPriceOverrideCents: inputs.totalPriceOverrideCents,
    lines: inputs.lines.map((l) => ({
      category: l.category,
      description: l.description,
      laborMinutes: l.laborMinutes ?? null,
      quantity: l.quantity ?? null,
      unitCostCents: l.unitCostCents ?? null,
      priceCents: l.priceCents ?? null,
    })),
  };
  const computed = computeEstimate(stored, {
    overheadRecoveryRate: rates.overheadRecoveryRate.value,
    burdenedLaborRate: rates.burdenedLaborRate,
    targetProfitPerHour: rates.targetProfitPerHour,
  });
  if (!computed.ok) return { ok: false, error: `Can't price this yet: ${computed.reason}.` };

  const priced = inputs.lines.map((l) => l.priceCents != null);
  return { ok: true, dto: estimateComputationToDTO(computed.value, priced, rates.targetProfitPerHour) };
}

/**
 * Duplicate an estimate into a new **inactive** version (Option A → tweak → Option B) copying its
 * inputs and lines, including any entered per-line prices. Does not change the active version or
 * re-seed context; tenant-scoped. Redirects to the copy; a foreign estimate id is a no-op.
 */
export async function duplicateEstimateAction(projectId: string, estimateId: string): Promise<void> {
  const session = await getServerSession();
  if (session.status !== "ready") return;
  const tenantDb = tenantDbForSession(session.authUserId, session.businessId);

  const copy = await duplicateEstimate(tenantDb, projectId, estimateId);
  if (!copy) return;

  revalidatePath(`/projects/${projectId}`);
  redirect(`/projects/${projectId}/estimates/${copy.id}`);
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
