"use server";

import { revalidatePath } from "next/cache";
import { getServerSession, tenantDbForSession } from "@/src/db/session";
import { codeFinderTool, type CodeFinderInput } from "@/src/tools";
import { resolveModelPort } from "@/src/ai";
import { dispatchAndCompose } from "@/app/_lib/compose";

export type CodeFinderActionResult = { ok: true; message: string } | { ok: false; error: string };

/**
 * Run a standalone Code Finder query (add-code-finder). Requires a configured model — code lookup
 * is the whole tool, so there's no useful no-AI fallback. Runs through `dispatchAndCompose` (the
 * one app-layer dispatch entry); Code Finder has no consumers, so that's a plain dispatch. Every
 * code it proposes is a `pending`, traceable `code_ref` suggestion; nothing commits until accept.
 */
export async function runCodeFinderAction(
  projectId: string,
  input: CodeFinderInput,
): Promise<CodeFinderActionResult> {
  const session = await getServerSession();
  if (session.status !== "ready") {
    return { ok: false, error: "Connect Supabase and sign in to look up codes." };
  }

  const resolution = resolveModelPort();
  if (resolution.status !== "configured") {
    return { ok: false, error: "Connect AI to look up local codes." };
  }

  const parsed = codeFinderTool.inputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Enter a code question first." };
  }

  const tenantDb = tenantDbForSession(session.authUserId, session.businessId);
  const project = await tenantDb.getProject(projectId);
  if (!project) return { ok: false, error: "Project not found." };

  try {
    const outcome = await dispatchAndCompose(
      { toolName: codeFinderTool.name, projectId, input: parsed.data, source: "user" },
      { tenantDb, port: resolution.port },
    );
    revalidatePath(`/projects/${projectId}/context`);
    revalidatePath(`/projects/${projectId}/tools`);
    const created = outcome.createdSuggestionIds.length;
    const dupe = outcome.skippedDuplicates;
    const parts = [
      created > 0 ? `${created} code${created === 1 ? "" : "s"} to review` : null,
      dupe > 0 ? `${dupe} already waiting` : null,
      outcome.messageId !== null ? "summary posted to the job" : null,
    ].filter(Boolean);
    const detail = parts.length > 0 ? parts.join(", ") : "no sourced local code found";
    return { ok: true, message: `Code Finder: ${detail}.` };
  } catch (err) {
    console.error(`[code-finder] query failed for project ${projectId}:`, err);
    return { ok: false, error: err instanceof Error ? err.message : "The code search failed." };
  }
}
