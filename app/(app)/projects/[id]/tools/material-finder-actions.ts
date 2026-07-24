"use server";

import { revalidatePath } from "next/cache";
import { getServerSession, tenantDbForSession } from "@/src/db/session";
import { suggestionKey } from "@/src/tools";
import {
  manualMaterialSchema,
  manualMaterialSuggestions,
  materialFinderTool,
  type MaterialFinderInput,
} from "@/src/tools";
import { resolveModelPort } from "@/src/ai";
import { dollarsToCents } from "@/src/db/validation";
import { dispatchAndCompose } from "@/app/_lib/compose";
import { assembleProjectSnapshot } from "@/app/_lib/project-snapshot";

export type MaterialActionResult = { ok: true; message: string } | { ok: false; error: string };

/** Revalidate the surfaces a new pending suggestion shows up on. */
function revalidate(projectId: string): void {
  revalidatePath(`/projects/${projectId}/context`);
  revalidatePath(`/projects/${projectId}/tools`);
}

/**
 * Run a Material Finder search (constitution §5, §7). Requires a configured model — when
 * `ANTHROPIC_API_KEY` is unset the search is unavailable and the caller falls back to manual
 * add. Dispatches through the tenant-scoped runner with the resolved live port, so every option
 * it proposes is a `pending`, traceable suggestion; nothing commits until the user accepts.
 */
export async function runMaterialFinderAction(
  projectId: string,
  input: MaterialFinderInput,
): Promise<MaterialActionResult> {
  const session = await getServerSession();
  if (session.status !== "ready") {
    return { ok: false, error: "Connect Supabase and sign in to search for materials." };
  }

  const resolution = resolveModelPort();
  if (resolution.status !== "configured") {
    return { ok: false, error: "Connect AI to search for materials — or add one by hand below." };
  }

  const tenantDb = tenantDbForSession(session.authUserId, session.businessId);
  const project = await tenantDb.getProject(projectId);
  if (!project) return { ok: false, error: "Project not found." };

  // Validate the input against the tool's own schema before dispatch (friendly, not a raw Zod dump).
  const parsed = materialFinderTool.inputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Enter what to search for." };
  }

  try {
    // Through the app-layer compose entry so every tool run shares one dispatch path; Material
    // Finder has no consumer today, so this is a plain dispatch.
    const outcome = await dispatchAndCompose(
      { toolName: materialFinderTool.name, projectId, input: parsed.data, source: "user" },
      { tenantDb, port: resolution.port },
    );
    revalidate(projectId);
    const created = outcome.createdSuggestionIds.length;
    const dupe = outcome.skippedDuplicates;
    const parts = [
      created > 0 ? `${created} option${created === 1 ? "" : "s"} proposed` : null,
      dupe > 0 ? `${dupe} duplicate skipped` : null,
      outcome.messageId !== null ? "summary posted to the job" : null,
    ].filter(Boolean);
    const detail = parts.length > 0 ? parts.join(", ") : "no sourced options found";
    return { ok: true, message: `Material Finder: ${detail}.` };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "The search failed." };
  }
}

/**
 * Hand-add a material (constitution §5) — no model, no `tool_run`. Creates the same `pending`
 * suggestions a searched material would (a `material` context entry, plus an `estimate_line_item`
 * when there's an active estimate) so the tool is usable before AI is configured and when a price
 * can't be found. `business_id` is stamped by the tenant handle; nothing commits until accept.
 */
export async function addMaterialAction(
  projectId: string,
  formData: FormData,
): Promise<MaterialActionResult> {
  const session = await getServerSession();
  if (session.status !== "ready") {
    return { ok: false, error: "Connect Supabase and sign in to add a material." };
  }

  const field = (name: string): string => {
    const v = formData.get(name);
    return typeof v === "string" ? v.trim() : "";
  };

  const priceCents = dollarsToCents(field("price"));
  if (priceCents === null) return { ok: false, error: "Enter a valid price (a non-negative dollar amount)." };

  const parsed = manualMaterialSchema.safeParse({
    name: field("name"),
    priceCents,
    unit: field("unit"),
    ...(field("supplier") !== "" ? { supplier: field("supplier") } : {}),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Fill in the material name, price, and unit." };
  }

  const tenantDb = tenantDbForSession(session.authUserId, session.businessId);
  const project = await tenantDb.getProject(projectId);
  if (!project) return { ok: false, error: "Project not found." };

  // The active estimate id decides whether the material also proposes a line item (P2 preview).
  const [snapshot, pending] = await Promise.all([
    assembleProjectSnapshot(tenantDb, projectId),
    tenantDb.listPendingSuggestions(projectId),
  ]);

  // Dedup against the pending queue with the runner's exact key, so hand-adding the same material
  // twice doesn't stack duplicate cards (matching how a search dedups).
  const seen = new Set(
    pending.map((p) => suggestionKey({ target: p.target, targetEstimateId: p.targetEstimateId, payload: p.payload })),
  );
  const suggestions = manualMaterialSuggestions(parsed.data, snapshot.activeEstimateId);
  let created = 0;
  for (const s of suggestions) {
    const key = suggestionKey({ target: s.target, targetEstimateId: s.targetEstimateId ?? null, payload: s.payload });
    if (seen.has(key)) continue;
    seen.add(key);
    await tenantDb.createSuggestion({
      projectId,
      target: s.target,
      payload: s.payload,
      targetEstimateId: s.targetEstimateId ?? null,
      author: "user",
    });
    created++;
  }

  revalidate(projectId);
  if (created === 0) {
    return { ok: true, message: `"${parsed.data.name}" is already waiting in the queue — nothing added.` };
  }
  const line = snapshot.activeEstimateId ? " and a line item on the active estimate" : "";
  return { ok: true, message: `Added "${parsed.data.name}" as a pending material${line}. Accept it to commit.` };
}
