"use server";

import { revalidatePath } from "next/cache";
import { getServerSession, tenantDbForSession } from "@/src/db/session";
import { getTool, runTool } from "@/src/tools";
import { createMockModelPort } from "@/src/ai";
import { assembleProjectSnapshot } from "@/app/_lib/project-snapshot";
import { tenantToolRunnerPorts } from "@/app/_lib/tool-runner";

export type RunToolResult = { ok: true; message: string } | { ok: false; error: string };

function field(formData: FormData, name: string): string {
  const v = formData.get(name);
  return typeof v === "string" ? v : "";
}

/**
 * Run a tool for a project (constitution §5). Resolves the business from the session
 * server-side (never trusts a client `business_id`), assembles the read-only snapshot, and
 * invokes the runner through the tenant-scoped ports — so the only things the run can produce
 * are `pending` suggestions and a conversation post, both traceable to the logged `tool_run`.
 *
 * The reference tool runs on the mock model port, so it needs no key. Real tools (#7+) will
 * resolve the live port and render a "connect AI" state when `ANTHROPIC_API_KEY` is unset.
 */
export async function runToolAction(
  projectId: string,
  toolName: string,
  formData: FormData,
): Promise<RunToolResult> {
  const session = await getServerSession();
  if (session.status !== "ready") {
    return { ok: false, error: "Connect Supabase and sign in to run a tool." };
  }

  const tool = getTool(toolName);
  if (!tool) return { ok: false, error: "Unknown tool." };

  const tenantDb = tenantDbForSession(session.authUserId, session.businessId);
  const project = await tenantDb.getProject(projectId);
  if (!project) return { ok: false, error: "Project not found." };

  // For the reference tool the only input is a note. Per-tool input forms arrive with each
  // real tool; here a friendly guard keeps the reference run from surfacing a raw Zod error.
  const note = field(formData, "note").trim();
  if (toolName === "reference" && note === "") {
    return { ok: false, error: "Enter a note for the reference tool first." };
  }

  const snapshot = await assembleProjectSnapshot(tenantDb, projectId);

  try {
    const outcome = await runTool(
      tool,
      { projectId, input: { note }, ai: createMockModelPort(), snapshot, source: "user" },
      tenantToolRunnerPorts(tenantDb),
    );
    revalidatePath(`/projects/${projectId}/context`);
    revalidatePath(`/projects/${projectId}/tools`);
    const created = outcome.createdSuggestionIds.length;
    const dupe = outcome.skippedDuplicates;
    const parts = [
      created > 0 ? `${created} suggestion${created === 1 ? "" : "s"} added to the queue` : null,
      dupe > 0 ? `${dupe} duplicate skipped` : null,
      "posted to the job conversation",
    ].filter(Boolean);
    return { ok: true, message: `Ran ${tool.title}: ${parts.join(", ")}.` };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "The tool run failed." };
  }
}
