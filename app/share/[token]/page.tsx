import type { Metadata } from "next";
import { getSharedDocument } from "@/src/db/share";
import { DocumentUnavailable, DocumentView } from "./document-view";

/**
 * The public client-document page (add-client-document). A top-level route — **outside** the
 * auth-gated `(app)` group and the middleware's protected prefixes — so a client with no account
 * opens it directly. It reads the payload through the token-gated `SECURITY DEFINER` function (the
 * one deliberate public capability, §7) and renders it, or a plain unavailable state.
 *
 * `robots: noindex, nofollow` so a leaked link never lands in a search engine. No session or
 * tenant lookup runs here (the root layout does none), so nothing internal is even in scope.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function SharedDocumentPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const result = await getSharedDocument(token);

  // A wrong/unshared/revoked token and an unconfigured backend both show the same plain state —
  // a token can't be probed, and nothing throws pre-infra.
  if (result.status !== "ok") return <DocumentUnavailable />;
  return <DocumentView document={result.document} />;
}
