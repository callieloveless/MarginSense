/**
 * Supabase server clients for auth flows (constitution §7). Separate from `session.ts`'s
 * read-only reader: auth actions (sign-in, sign-out, create-business) must be able to
 * write session cookies, which is allowed inside route handlers and server actions.
 *
 * Returns null when Supabase env is not configured, so callers render a "connect
 * Supabase" state instead of throwing before infra lands.
 */

import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

export async function getWritableServerClient(): Promise<SupabaseClient | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;

  const store = await cookies();
  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return store.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value, options } of cookiesToSet) {
          store.set(name, value, options);
        }
      },
    },
  });
}
