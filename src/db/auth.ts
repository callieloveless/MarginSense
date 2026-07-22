/**
 * Session → business resolution (constitution §6.3, §7).
 *
 * The signed-in user's `business_id` is resolved **on the server** from the auth
 * session's identity (`auth.uid()`) via the `users` table — it is never read from client
 * input. This is the single choke point that turns a session into a `businessId`, which
 * then flows into `createTenantDb`. Kept as small, injectable functions so it unit-tests
 * without a live Supabase client.
 */

import type { BusinessId } from "./tenant";

/** The trusted part of an auth session: the authenticated user id, or null if signed out. */
export interface AuthSession {
  /** Supabase `auth.uid()`. Null when there is no authenticated user. */
  authUserId: string | null;
}

/** Looks up which business an auth identity belongs to (backed by the `users` table). */
export interface UserBusinessLookup {
  businessIdForAuthId(authUserId: string): Promise<BusinessId | null>;
}

/**
 * Resolve the session's business id, or null when there is no signed-in user or the user
 * has no business yet (first sign-in → create-business step). Only the session's
 * `authUserId` is trusted; no business identifier from the request is consulted.
 */
export async function resolveBusinessId(
  session: AuthSession,
  lookup: UserBusinessLookup,
): Promise<BusinessId | null> {
  if (!session.authUserId) return null;
  return lookup.businessIdForAuthId(session.authUserId);
}
