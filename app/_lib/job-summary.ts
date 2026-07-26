/**
 * Pure presentation helpers for the job hub (revamp-project-hub) — the job's identity sub-line and
 * the two honest tools-grid badges. Kept out of the server component so they can be unit-tested and
 * so a badge is only ever shown when a real count/status backs it (no fabricated numbers, §6).
 */

import type { DocumentRow, ProjectRow } from "@/src/db/schema";
import { crewLabel } from "./job-vocab";
import { DOCUMENT_STATUS_LABEL, documentStatus, type DocumentStatus } from "./document-status";

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
  if (project.crewSize) parts.push(crewLabel(project.crewSize));
  if (project.startWindow) parts.push(project.startWindow);
  return parts.length > 0 ? parts.join(" · ") : null;
}

/** The Job-memory tile's badge: the photo count when storage is connected and there is at least
 * one photo, else null (no badge — the tile still opens). */
export function photoBadge(storageReady: boolean, photoCount: number): string | null {
  if (!storageReady || photoCount <= 0) return null;
  return photoCount === 1 ? "1 photo" : `${photoCount} photos`;
}

/**
 * The Client-document tile's badge — the most salient document status for the job, using the same
 * derivation and labels as the documents panel (so a revoked document reads "Link off" here too):
 * a live shared document wins, else a draft, else the share is off. No document → null (the tile
 * still opens to generate one).
 */
export function documentBadge(
  documents: readonly Pick<DocumentRow, "sharedAt" | "revokedAt">[],
): string | null {
  if (documents.length === 0) return null;
  const statuses = documents.map(documentStatus);
  const salient: DocumentStatus = statuses.includes("shared")
    ? "shared"
    : statuses.includes("draft")
      ? "draft"
      : "revoked";
  return DOCUMENT_STATUS_LABEL[salient];
}
