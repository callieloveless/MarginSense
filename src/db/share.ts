/**
 * The public client-document read (add-client-document) — the single path that returns document
 * data **without a tenant session**, for a client who has no account.
 *
 * It calls the `get_shared_document(token)` `SECURITY DEFINER` function (migration `0009`) through
 * the **Supabase anon client** (anon key, no cookies), so it never touches the tenant-scoped
 * Drizzle path and RLS is never in play. The function returns one document's client-safe payload
 * only when the token matches a document that is shared and not revoked; anything else — wrong
 * token, unshared, revoked — comes back null. The payload is re-validated by `src/document/` before
 * it is handed to the render, so even the public page only ever shows a well-formed, client-safe
 * document.
 *
 * Server-only (uses the anon key server-side and hits the DB), but deliberately session-free.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { parseClientDocument, type ClientDocument } from "../document";

export type SharedDocumentResult =
  | { readonly status: "ok"; readonly document: ClientDocument }
  | { readonly status: "not-found" }
  | { readonly status: "unconfigured" };

/** One stateless anon client, reused across public reads (no cookies, `persistSession: false`), so
 * the hot `/share` path doesn't construct a client per request. Rebuilt only if env changes. */
let cachedAnon: { url: string; client: SupabaseClient } | null = null;
function anonClient(url: string, anonKey: string): SupabaseClient {
  if (cachedAnon?.url !== url) {
    cachedAnon = { url, client: createClient(url, anonKey, { auth: { persistSession: false } }) };
  }
  return cachedAnon.client;
}

/**
 * Fetch a shared document by its token. `not-found` covers a wrong, unshared, or revoked token
 * (indistinguishable on purpose — the page says the same thing either way); `unconfigured` when
 * Supabase env is absent (pre-infra), so the page can render a plain state instead of throwing.
 */
export async function getSharedDocument(token: string): Promise<SharedDocumentResult> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return { status: "unconfigured" };
  if (!token) return { status: "not-found" };

  // A plain anon client — no cookie/session wiring. It can only reach what anon is granted, which
  // is exactly one function returning one client-safe payload.
  const supabase = anonClient(url, anonKey);
  const { data, error } = await supabase.rpc("get_shared_document", { p_token: token });
  if (error) {
    // Fail closed (not-found), but never silent: this is where a missing function — migration 0009
    // not applied — looks identical to a wrong token, so log the cause or every link breaks blind.
    console.error("[share] get_shared_document RPC failed (is migration 0009 applied?):", error.message);
    return { status: "not-found" };
  }
  if (data == null) return { status: "not-found" };

  // Defense in depth: the row was validated at write time, but re-validate what we're about to
  // show a client, so a hand-tampered row can never render as a document.
  const parsed = parseClientDocument(data);
  if (!parsed.ok) return { status: "not-found" };
  return { status: "ok", document: parsed.value };
}
