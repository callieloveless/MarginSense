/**
 * Pure presentation helpers for the job hub (revamp-project-hub) — the job's identity sub-line and
 * the two honest tools-grid badges. Kept out of the server component so they can be unit-tested and
 * so a badge is only ever shown when a real count/status backs it (no fabricated numbers, §6).
 */

import type { DocumentRow, ProjectRow } from "@/src/db/schema";

/**
 * The job's identity sub-line — address · job type · crew · start window — built from only the
 * setup fields that are set. Returns null when none are set (the hub then shows just the client
 * name), never a placeholder for a missing field.
 */
export function jobSubline(
  project: Pick<ProjectRow, "address" | "jobType" | "crewSize" | "startWindow">,
): string | null {
  const parts: string[] = [];
  if (project.address) parts.push(project.address);
  if (project.jobType) parts.push(project.jobType);
  if (project.crewSize) parts.push(project.crewSize === "Just me" ? "Just me" : `${project.crewSize} crew`);
  if (project.startWindow) parts.push(project.startWindow);
  return parts.length > 0 ? parts.join(" · ") : null;
}

/** The Job-memory tile's badge: the photo count when storage is connected and there is at least
 * one photo, else null (no badge — the tile still opens). */
export function photoBadge(storageReady: boolean, photoCount: number): string | null {
  if (!storageReady || photoCount <= 0) return null;
  return photoCount === 1 ? "1 photo" : `${photoCount} photos`;
}

export type DocBadge = "Shared" | "Draft" | null;

/**
 * The Client-document tile's badge, derived from the job's documents: "Shared" when a live shared
 * document exists (shared and not revoked), "Draft" when a document exists but none is live, and
 * null when there is no document (no badge — the tile still opens to generate one).
 */
export function documentBadge(
  documents: readonly Pick<DocumentRow, "sharedAt" | "revokedAt">[],
): DocBadge {
  if (documents.length === 0) return null;
  const live = documents.some((d) => d.sharedAt != null && d.revokedAt == null);
  return live ? "Shared" : "Draft";
}
