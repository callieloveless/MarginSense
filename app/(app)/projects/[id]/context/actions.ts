"use server";

import { revalidatePath } from "next/cache";
import { getServerSession, tenantDbForSession } from "@/src/db/session";

export type ContextActionResult = { ok: true } | { ok: false; error: string };

function field(formData: FormData, name: string): string {
  const v = formData.get(name);
  return typeof v === "string" ? v : "";
}

/** Post a message into the project's single conversation (constitution §4.2). */
export async function postMessageAction(
  projectId: string,
  formData: FormData,
): Promise<ContextActionResult> {
  const session = await getServerSession();
  if (session.status !== "ready") {
    return { ok: false, error: "Connect Supabase and sign in to post." };
  }
  const body = field(formData, "body").trim();
  if (body === "") return { ok: false, error: "Type a message first." };

  await tenantDbForSession(session.authUserId, session.businessId).postMessage({ projectId, body });
  revalidatePath(`/projects/${projectId}/context`);
  return { ok: true };
}

/**
 * Accept a suggestion — the ONLY path that commits its proposed change (constitution §5),
 * server-side and tenant-scoped. Void so it can drive a plain form; it revalidates the view.
 */
export async function acceptSuggestionAction(projectId: string, suggestionId: string): Promise<void> {
  const session = await getServerSession();
  if (session.status !== "ready") return;
  await tenantDbForSession(session.authUserId, session.businessId).acceptSuggestion(suggestionId);
  revalidatePath(`/projects/${projectId}/context`);
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/dashboard");
}

/** Dismiss a suggestion — remembered so it never re-nags; commits nothing (constitution §5). */
export async function dismissSuggestionAction(projectId: string, suggestionId: string): Promise<void> {
  const session = await getServerSession();
  if (session.status !== "ready") return;
  await tenantDbForSession(session.authUserId, session.businessId).dismissSuggestion(suggestionId);
  revalidatePath(`/projects/${projectId}/context`);
}
