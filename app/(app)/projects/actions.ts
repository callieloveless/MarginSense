"use server";

import { revalidatePath } from "next/cache";
import { getServerSession, tenantDbForBusiness } from "@/src/db/session";
import { projectInputSchema } from "@/src/db/validation";

export type CreateProjectResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

/**
 * Create a project for the signed-in business (constitution §6.3). The `business_id` is
 * taken from the resolved session — never from the form — and stamped by the tenant-bound
 * handle. Input is validated at the boundary with Zod.
 */
export async function createProjectAction(
  formData: FormData,
): Promise<CreateProjectResult> {
  const session = await getServerSession();
  if (session.status !== "ready") {
    return { ok: false, error: "Connect Supabase and sign in to create projects." };
  }

  const parsed = projectInputSchema.safeParse({
    clientName: formData.get("clientName"),
    address: formData.get("address") || null,
    scope: formData.get("scope") || null,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const tenantDb = tenantDbForBusiness(session.businessId);
  const project = await tenantDb.createProject(parsed.data);

  revalidatePath("/projects");
  return { ok: true, id: project.id };
}
