"use server";

import { revalidatePath } from "next/cache";
import { getServerSession, tenantDbForSession } from "@/src/db/session";
import { parseProjectForm } from "@/src/db/validation";

export type CreateProjectResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

/** Read a form field as a string ("" when absent). */
function field(formData: FormData, name: string): string {
  const v = formData.get(name);
  return typeof v === "string" ? v : "";
}

/**
 * Create a project for the signed-in business (constitution §6.3) from the two-step new-job
 * wizard. The `business_id` is taken from the resolved session — never from the form — and
 * stamped by the tenant-bound handle. Input is validated + converted at the boundary
 * (percentages → basis points) by `parseProjectForm`.
 */
export async function createProjectAction(
  formData: FormData,
): Promise<CreateProjectResult> {
  const session = await getServerSession();
  if (session.status !== "ready") {
    return { ok: false, error: "Connect Supabase and sign in to create projects." };
  }

  const parsed = parseProjectForm({
    clientName: field(formData, "clientName"),
    address: field(formData, "address"),
    scope: field(formData, "scope"),
    jobType: field(formData, "jobType"),
    crewSize: field(formData, "crewSize"),
    startWindow: field(formData, "startWindow"),
    targetMargin: field(formData, "targetMargin"),
    contingency: field(formData, "contingency"),
  });
  if (!parsed.ok) {
    return { ok: false, error: parsed.error };
  }

  const tenantDb = tenantDbForSession(session.authUserId, session.businessId);
  const project = await tenantDb.createProject(parsed.data);

  revalidatePath("/projects");
  return { ok: true, id: project.id };
}
