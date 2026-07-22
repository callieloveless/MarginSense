/**
 * Server-side session → business wiring (constitution §6.3, §7). Ties Supabase Auth to
 * the tenant model: reads the signed-in identity from the request's cookies, then
 * resolves its `business_id` via the `users` table — never trusting client input.
 *
 * This module is server-only (it reads cookies and the database). Until the Supabase
 * project + `DATABASE_URL` are configured, `getServerSession()` returns an
 * `unconfigured` marker so the app shell can render a "connect Supabase" state instead of
 * crashing — the skeleton is walkable before infra lands.
 */

import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { eq } from "drizzle-orm";
import { users } from "./schema.js";
import { getDb } from "./client.js";
import { resolveBusinessId, type AuthSession } from "./auth.js";
import { createTenantDb, type BusinessId, type TenantDb } from "./tenant.js";
import { getBackends } from "./client.js";

export type ServerSession =
  | { status: "unconfigured" }
  | { status: "signed-out" }
  | { status: "no-business"; authUserId: string }
  | { status: "ready"; authUserId: string; businessId: BusinessId };

function supabaseEnv(): { url: string; anonKey: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey || !process.env.DATABASE_URL) return null;
  return { url, anonKey };
}

/** The Supabase server client bound to this request's cookies (read-only cookie access
 * is enough for session reads in server components). */
async function serverClient(url: string, anonKey: string) {
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

/** Resolve the current request's session and tenant, guarding un-configured infra. */
export async function getServerSession(): Promise<ServerSession> {
  const env = supabaseEnv();
  if (!env) return { status: "unconfigured" };

  const supabase = await serverClient(env.url, env.anonKey);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const session: AuthSession = { authUserId: user?.id ?? null };
  if (!session.authUserId) return { status: "signed-out" };

  const db = getDb();
  const businessId = await resolveBusinessId(session, {
    async businessIdForAuthId(authUserId) {
      const found = await db
        .select({ businessId: users.businessId })
        .from(users)
        .where(eq(users.authId, authUserId))
        .limit(1);
      return found[0]?.businessId ?? null;
    },
  });

  if (!businessId) return { status: "no-business", authUserId: session.authUserId };
  return { status: "ready", authUserId: session.authUserId, businessId };
}

/** Build a tenant-bound data handle for a resolved business (constitution §6.3). Only
 * reached in the `ready` state, so the caller always has a real `business_id`. */
export function tenantDbForBusiness(businessId: BusinessId): TenantDb {
  return createTenantDb(businessId, getBackends());
}
