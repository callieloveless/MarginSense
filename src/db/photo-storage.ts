/**
 * Job-photo object storage over Supabase Storage (add-photo-capture; techstack §1) — the
 * `PhotoStorageBackend` half of the photo seam. Rows live in Postgres behind RLS
 * (`drizzle-backend.ts`); the **bytes** live here, outside Postgres and therefore outside that
 * guarantee, which is why isolation is enforced three ways:
 *
 * 1. keys are built only by `src/photos/photoObjectKey()` from the tenant handle's business id;
 * 2. every method here refuses a key outside the calling business's prefix;
 * 3. migration `0008` puts a `storage.objects` policy on the same first key segment.
 *
 * The bucket name comes from {@link PHOTO_BUCKET} and is deliberately **not** configurable: that
 * policy names one bucket, so an app pointed at a different one would fall outside it and lose
 * layer 3 silently.
 *
 * The client is the **session-scoped SSR client** (anon key + the signed-in user's JWT), never
 * the service-role key — service-role bypasses storage policies and would move the whole
 * guarantee back into app code. Cookies are read-only here: the middleware refreshes sessions,
 * so this works in a server component render as well as in a server action. One client is built
 * per backend instance (i.e. per request), not per call.
 *
 * Without Supabase env configured, {@link resolvePhotoStorage} reports `unconfigured` and the
 * job surface renders a "connect storage" state — the same posture `src/ai/` takes without an
 * API key.
 */

import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { keyBelongsToBusiness, PHOTO_BUCKET } from "../photos";
import type { BusinessId, PhotoStorageBackend } from "./tenant";

/** Whether object storage has a usable configuration this request. */
export type PhotoStorageResolution =
  | { readonly status: "configured"; readonly backend: PhotoStorageBackend }
  | { readonly status: "unconfigured" };

/** A Supabase client bound to this request's cookies, read-only (no session writes needed). */
async function createStorageClient(url: string, anonKey: string): Promise<SupabaseClient> {
  const store = await cookies();
  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return store.getAll();
      },
      // Server components cannot set cookies; middleware refreshes the session instead.
      setAll() {},
    },
  });
}

/**
 * The real object backend. Every method takes the calling `businessId` and refuses a key
 * outside its prefix *before* reaching the network — so a bug elsewhere cannot turn into a
 * cross-tenant read, and the DB policy stays the backstop rather than the only check.
 */
export function createSupabasePhotoStorage(url: string, anonKey: string): PhotoStorageBackend {
  // Built once per backend instance (one per request) and shared by every call — signing a
  // gallery of photos should not re-read the cookie store and re-construct a client each time.
  let client: Promise<SupabaseClient> | null = null;
  const storageClient = (): Promise<SupabaseClient> => {
    client ??= createStorageClient(url, anonKey);
    return client;
  };

  return {
    async putObject(businessId: BusinessId, input) {
      if (!keyBelongsToBusiness(businessId, input.key)) {
        throw new Error("Refusing to write an object outside this business's prefix.");
      }
      const supabase = await storageClient();
      const { error } = await supabase.storage.from(PHOTO_BUCKET).upload(input.key, input.bytes, {
        contentType: input.contentType,
        upsert: false,
      });
      if (error) throw new Error(`Photo upload failed: ${error.message}`);
    },

    async signedUrls(businessId: BusinessId, keys, expiresInSeconds) {
      const signed = new Map<string, string>();
      const ours = keys.filter((key) => keyBelongsToBusiness(businessId, key));
      if (ours.length === 0) return signed;

      const supabase = await storageClient();
      // One request for the whole set — a gallery signs every thumbnail in a single round trip.
      const { data, error } = await supabase.storage
        .from(PHOTO_BUCKET)
        .createSignedUrls([...ours], expiresInSeconds);
      // A missing object or a policy refusal leaves that key unsigned, rather than failing the
      // whole page — the gallery shows a plain "unavailable" tile for it.
      if (error || !data) return signed;

      for (const entry of data) {
        if (entry.path && entry.signedUrl && !entry.error) signed.set(entry.path, entry.signedUrl);
      }
      return signed;
    },

    async getObject(businessId: BusinessId, key: string) {
      if (!keyBelongsToBusiness(businessId, key)) return null;
      const supabase = await storageClient();
      const { data, error } = await supabase.storage.from(PHOTO_BUCKET).download(key);
      // A missing object or a policy refusal reads as null, not a throw — the caller reports
      // "that photo couldn't be read" rather than failing the request.
      if (error || !data) return null;
      return {
        bytes: new Uint8Array(await data.arrayBuffer()),
        contentType: data.type || "application/octet-stream",
      };
    },

    async deleteObjects(businessId: BusinessId, keys) {
      const ours = keys.filter((key) => keyBelongsToBusiness(businessId, key));
      if (ours.length === 0) return;
      const supabase = await storageClient();
      const { error } = await supabase.storage.from(PHOTO_BUCKET).remove([...ours]);
      if (error) throw new Error(`Photo delete failed: ${error.message}`);
    },
  };
}

/**
 * Resolve object storage from the environment, mirroring `resolveModelPort()`. Returns
 * `unconfigured` when Supabase env is absent — no client is constructed and the caller renders
 * a "connect storage" state. `env` is injectable for tests.
 */
export function resolvePhotoStorage(
  env: Record<string, string | undefined> = process.env,
): PhotoStorageResolution {
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return { status: "unconfigured" };
  return { status: "configured", backend: createSupabasePhotoStorage(url, anonKey) };
}
