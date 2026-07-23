/**
 * Job-photo object storage over Supabase Storage (add-photo-capture; techstack §1) — the
 * `PhotoStorageBackend` half of the photo seam. Rows live in Postgres behind RLS
 * (`drizzle-backend.ts`); the **bytes** live here, outside Postgres and therefore outside that
 * guarantee, which is why isolation is enforced three ways:
 *
 * 1. keys are built only by `src/photos/photoObjectKey()` from the tenant handle's business id;
 * 2. every method here refuses a key outside the calling business's prefix;
 * 3. migration `0007` puts a `storage.objects` policy on the same first key segment.
 *
 * The client is the **session-scoped SSR client** (anon key + the signed-in user's JWT), never
 * the service-role key — service-role bypasses storage policies and would move the whole
 * guarantee back into app code. Cookies are read-only here: the middleware refreshes sessions,
 * so this works in a server component render as well as in a server action.
 *
 * Without Supabase env configured, {@link resolvePhotoStorage} reports `unconfigured` and the
 * job surface renders a "connect storage" state — the same posture `src/ai/` takes without an
 * API key.
 */

import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { keyBelongsToBusiness } from "../photos";
import type { BusinessId, PhotoStorageBackend } from "./tenant";

/** The bucket job photos live in. Must match the bucket created in migration `0007`. */
export const DEFAULT_PHOTO_BUCKET = "job-photos";

/** Env var overriding the bucket name (e.g. a separate bucket per environment). */
export const PHOTO_BUCKET_ENV = "SUPABASE_PHOTO_BUCKET";

/** Whether object storage has a usable configuration this request. */
export type PhotoStorageResolution =
  | { readonly status: "configured"; readonly backend: PhotoStorageBackend }
  | { readonly status: "unconfigured" };

/** A Supabase client bound to this request's cookies, read-only (no session writes needed). */
async function storageClient(url: string, anonKey: string) {
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
export function createSupabasePhotoStorage(
  url: string,
  anonKey: string,
  bucket: string,
): PhotoStorageBackend {
  return {
    async putObject(businessId: BusinessId, input) {
      if (!keyBelongsToBusiness(businessId, input.key)) {
        throw new Error("Refusing to write an object outside this business's prefix.");
      }
      const supabase = await storageClient(url, anonKey);
      const { error } = await supabase.storage.from(bucket).upload(input.key, input.bytes, {
        contentType: input.contentType,
        upsert: false,
      });
      if (error) throw new Error(`Photo upload failed: ${error.message}`);
    },

    async signedUrl(businessId: BusinessId, key: string, expiresInSeconds: number) {
      if (!keyBelongsToBusiness(businessId, key)) return null;
      const supabase = await storageClient(url, anonKey);
      const { data, error } = await supabase.storage
        .from(bucket)
        .createSignedUrl(key, expiresInSeconds);
      // A missing object or a policy refusal is a null URL, not a thrown error — the gallery
      // shows a plain "unavailable" tile rather than failing the whole page.
      if (error || !data) return null;
      return data.signedUrl;
    },

    async deleteObjects(businessId: BusinessId, keys) {
      const ours = keys.filter((key) => keyBelongsToBusiness(businessId, key));
      if (ours.length === 0) return;
      const supabase = await storageClient(url, anonKey);
      const { error } = await supabase.storage.from(bucket).remove([...ours]);
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
  const bucket = env[PHOTO_BUCKET_ENV] || DEFAULT_PHOTO_BUCKET;
  return { status: "configured", backend: createSupabasePhotoStorage(url, anonKey, bucket) };
}
