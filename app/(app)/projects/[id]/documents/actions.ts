"use server";

import { revalidatePath } from "next/cache";
import { getServerSession, tenantDbForSession } from "@/src/db/session";
import { resolveModelPort, createMockModelPort } from "@/src/ai";
import { generateClientDocument } from "@/app/_lib/generate-document";

export type DocumentActionResult = { ok: true; message: string } | { ok: false; error: string };

function revalidate(projectId: string): void {
  revalidatePath(`/projects/${projectId}/documents`);
  revalidatePath(`/projects/${projectId}`);
}

/**
 * Generate a client document from the project's active estimate (add-client-estimate-doc). The
 * business is resolved from the session; the model port is passed only so the tool can write a
 * scope narrative when AI is configured (otherwise the mock, and `writeNarrative` is off). The
 * document is created **unshared** — the owner reviews it before sharing.
 */
export async function generateDocumentAction(projectId: string): Promise<DocumentActionResult> {
  const session = await getServerSession();
  if (session.status !== "ready") {
    return { ok: false, error: "Connect Supabase and sign in to generate a document." };
  }

  const tenantDb = tenantDbForSession(session.authUserId, session.businessId);
  const resolution = resolveModelPort();
  const aiConfigured = resolution.status === "configured";

  const result = await generateClientDocument(
    tenantDb,
    aiConfigured ? resolution.port : createMockModelPort(),
    { projectId, writeNarrative: aiConfigured, now: new Date() },
  );
  if (!result.ok) return { ok: false, error: result.error };

  revalidate(projectId);
  const scope = aiConfigured ? " with a scope summary" : "";
  return { ok: true, message: `Draft created${scope}. Review it below, then share when it's ready.` };
}

/** Edit an unshared draft's scope narrative and/or terms (the review step before sharing). */
export async function updateDraftAction(
  projectId: string,
  documentId: string,
  edits: { intro?: string | null; terms?: string | null },
): Promise<DocumentActionResult> {
  const session = await getServerSession();
  if (session.status !== "ready") return { ok: false, error: "Sign in to edit a document." };

  const tenantDb = tenantDbForSession(session.authUserId, session.businessId);
  let updated;
  try {
    updated = await tenantDb.updateDocumentDraft(documentId, edits);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "That edit couldn't be saved." };
  }
  if (!updated) return { ok: false, error: "This document can't be edited — it may already be shared." };

  revalidate(projectId);
  return { ok: true, message: "Draft updated." };
}

/**
 * Share a document — returns the public link to copy. Re-sharing a revoked document mints a fresh
 * token (10a), so the returned URL is always the current one.
 */
export async function shareDocumentAction(
  projectId: string,
  documentId: string,
): Promise<DocumentActionResult> {
  const session = await getServerSession();
  if (session.status !== "ready") return { ok: false, error: "Sign in to share a document." };

  const tenantDb = tenantDbForSession(session.authUserId, session.businessId);
  const doc = await tenantDb.shareDocument(documentId);
  if (!doc) return { ok: false, error: "Document not found." };

  revalidate(projectId);
  // The relative path; the client prepends its origin to make a copyable absolute link (the server
  // can't know the browser's origin reliably).
  return { ok: true, message: `/share/${doc.shareToken}` };
}

/** Revoke a document — its public link stops resolving. */
export async function revokeDocumentAction(
  projectId: string,
  documentId: string,
): Promise<DocumentActionResult> {
  const session = await getServerSession();
  if (session.status !== "ready") return { ok: false, error: "Sign in to revoke a document." };

  const tenantDb = tenantDbForSession(session.authUserId, session.businessId);
  const doc = await tenantDb.revokeDocument(documentId);
  if (!doc) return { ok: false, error: "Document not found." };

  revalidate(projectId);
  return { ok: true, message: "Link turned off." };
}
