/**
 * Generating a client document from a project's active estimate (add-client-estimate-doc), lifted
 * out of the server action so it takes a `TenantDb` + `ModelPort` and is testable against the
 * in-memory backends — the same shape as `photo-advise.ts` and `job-profit.ts`.
 *
 * It reads the estimate + its lines + settings + business + project tenant-scoped, computes the
 * solved total via the engine, assembles the Client Estimate Doc tool's input (stamping the
 * prepared date here so the pure projection never needs `Date.now()`), dispatches the tool, and
 * creates the document **unshared** via 10a's seam. The document is a `pending`-free artifact —
 * the tool emits no suggestion — so nothing here commits an estimate or context change.
 */

import { dispatch, clientEstimateDocTool, type ClientEstimateDocInput } from "@/src/tools";
import { type ModelPort } from "@/src/ai";
import { type TenantDb } from "@/src/db/tenant";
import { type DocumentRow } from "@/src/db/schema";
import { type ClientDocument } from "@/src/document";
import { lineCost } from "@/src/engine";
import { businessRates, rowsToStoredEstimate } from "./estimate-compute";
import { computeEstimate, activeVersion, toEngineLine } from "@/src/estimate";
import { dispatchDeps } from "./tool-runner";

export type GenerateDocumentResult =
  | { ok: true; document: DocumentRow }
  | { ok: false; error: string };

/** A readable prepared date for the business, stamped at generation and frozen into the snapshot.
 * `now` is injected so callers/tests control it (no `Date.now()` in shared code). */
export function formatPreparedOn(now: Date): string {
  return now.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

/**
 * Generate a client document from the project's active estimate. `port` is the resolved model port
 * (the tool writes a scope narrative only when `writeNarrative` is true); `now` stamps the date.
 */
export async function generateClientDocument(
  tenantDb: TenantDb,
  port: ModelPort,
  input: { projectId: string; writeNarrative: boolean; now: Date },
): Promise<GenerateDocumentResult> {
  const project = await tenantDb.getProject(input.projectId);
  if (!project) return { ok: false, error: "Project not found." };

  const [business, settings, estimates] = await Promise.all([
    tenantDb.getBusiness(),
    tenantDb.getSettings(),
    tenantDb.listEstimates(input.projectId),
  ]);
  if (!business) return { ok: false, error: "Business not found." };
  if (!settings) return { ok: false, error: "Finish onboarding before generating a client document." };

  const active = activeVersion(estimates);
  if (!active) return { ok: false, error: "Mark an estimate active before generating a client document." };

  const lines = await tenantDb.getLineItems(active.id);
  if (lines.length === 0) return { ok: false, error: "This estimate has no line items yet." };

  // The engine's solved (or overridden) total, and each line's internal cost.
  const rates = businessRates(settings);
  if (!rates.overheadRecoveryRate.ok) {
    return { ok: false, error: "Finish your capacity settings before generating a client document." };
  }
  const ratesInput = {
    overheadRecoveryRate: rates.overheadRecoveryRate.value,
    burdenedLaborRate: rates.burdenedLaborRate,
  };
  const stored = rowsToStoredEstimate(active, lines);
  const computed = computeEstimate(stored, ratesInput);
  if (!computed.ok) {
    return { ok: false, error: "This estimate can't be priced yet — check the target margin and capacity." };
  }

  const toolInput: ClientEstimateDocInput = {
    businessName: business.name,
    title: `${project.clientName} — ${active.versionLabel}`,
    clientName: project.clientName,
    preparedOn: formatPreparedOn(input.now),
    lines: stored.lines.map((l, i) => ({
      description: l.description ?? defaultLineName(l.category),
      costCents: lineCost(toEngineLine(l), ratesInput.burdenedLaborRate),
      hasPriceOverride: lines[i]!.priceCents != null,
    })),
    totalPriceCents: computed.value.price,
    writeNarrative: input.writeNarrative,
    ...(business.tradeType ? { tradeType: business.tradeType } : {}),
    ...(settings.serviceArea ? { serviceArea: settings.serviceArea } : {}),
    ...(project.address ? { clientAddress: project.address } : {}),
    ...(settings.defaultTaxRateBp != null ? { taxRateBp: settings.defaultTaxRateBp } : {}),
  };

  let output: ClientDocument;
  try {
    const outcome = await dispatch(
      { toolName: clientEstimateDocTool.name, projectId: input.projectId, input: toolInput, source: "user" },
      dispatchDeps(tenantDb, port),
    );
    output = outcome.output as ClientDocument;
  } catch (err) {
    // The tool surfaces the projection's refusal (unpriced, per-line override) as its error.
    return { ok: false, error: err instanceof Error ? err.message : "The document couldn't be generated." };
  }

  const document = await tenantDb.createDocument({
    projectId: input.projectId,
    estimateId: active.id,
    payload: output,
  });
  return { ok: true, document };
}

/** A client-friendly fallback name for a line with no description. */
function defaultLineName(category: string): string {
  switch (category) {
    case "labor":
      return "Labor";
    case "material":
      return "Materials";
    case "subcontractor":
      return "Subcontractor";
    case "equipment":
      return "Equipment";
    case "permit":
      return "Permit";
    case "disposal":
      return "Disposal";
    default:
      return "Work";
  }
}
