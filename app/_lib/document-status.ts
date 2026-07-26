/**
 * The canonical status of a client document, derived from its share timestamps — the single source
 * both the documents panel and the job hub's badge read, so they can never disagree (a revoked
 * document is "Link off" everywhere, not "Draft" on one surface). Presentation glue over two
 * nullable columns; no DB, no math.
 */

import type { DocumentRow } from "@/src/db/schema";

export type DocumentStatus = "draft" | "shared" | "revoked";

/**
 * A document's status from its share timestamps: revoked wins over shared, shared over draft —
 * matching the public read, which serves a document only while `revokedAt` is null.
 */
export function documentStatus(row: Pick<DocumentRow, "sharedAt" | "revokedAt">): DocumentStatus {
  return row.revokedAt ? "revoked" : row.sharedAt ? "shared" : "draft";
}

/** The short human label for each status, shown identically on the documents panel and the hub. */
export const DOCUMENT_STATUS_LABEL: Record<DocumentStatus, string> = {
  draft: "Draft",
  shared: "Shared",
  revoked: "Link off",
};
