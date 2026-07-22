/**
 * RLS request context (constitution §6.3) — the piece that makes `auth.uid()` real for
 * Drizzle.
 *
 * The app connects to Postgres through the Supabase pooler as one login role for every
 * request. On its own that role would either bypass Row-Level Security (it owns the
 * tables) or have no identity for the policies to key on — so `auth.uid()` would be null
 * and tenancy would not be enforced.
 *
 * `withAuthenticatedTx` fixes both in one transaction: it drops the connection to the
 * `authenticated` role (which RLS *does* apply to) and publishes the signed-in user's id
 * as the JWT `sub` claim that Supabase's `auth.uid()` reads. Both are `SET LOCAL`, so they
 * live only for that transaction — correct under the pooler's transaction mode, and reset
 * the moment the transaction ends. The user id is the one the server already verified from
 * the session (never client input), so trusting it here is sound.
 *
 * Every tenant data path runs inside this wrapper; feature code never touches the raw
 * connection. That is what upgrades RLS from "declared" to "enforced".
 */

import { sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { BusinessId } from "./tenant";

/** The Drizzle handle over postgres.js. Schema generic left default. */
export type Db = PostgresJsDatabase<Record<string, never>>;
/** The transaction handle Drizzle hands to a `db.transaction(...)` callback. */
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/**
 * Run `fn` inside a transaction scoped to `authUserId`: RLS is enforced as the
 * `authenticated` role and `auth.uid()` resolves to this user. All tenant reads/writes go
 * through here.
 */
export async function withAuthenticatedTx<T>(
  db: Db,
  authUserId: string,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  if (!authUserId) {
    throw new Error("withAuthenticatedTx requires an authenticated user id.");
  }
  // Only the verified `sub` matters to auth.uid(); role pins the RLS role for the tx.
  const claims = JSON.stringify({ sub: authUserId, role: "authenticated" });
  return db.transaction(async (tx) => {
    // Publish identity first (still as the owner role), then drop privileges to
    // `authenticated`. `SET LOCAL` (is_local = true) confines both to this transaction.
    await tx.execute(sql`select set_config('request.jwt.claims', ${claims}, true)`);
    await tx.execute(sql`select set_config('role', 'authenticated', true)`);
    return fn(tx);
  });
}

/**
 * Resolve the signed-in user's business via the database's own `current_business_id()`
 * (the same function the RLS policies use), inside the authenticated context. Returns null
 * when the user has no business yet (first sign-in → create-business).
 */
export async function businessIdForAuthUser(
  db: Db,
  authUserId: string,
): Promise<BusinessId | null> {
  return withAuthenticatedTx(db, authUserId, async (tx) => {
    const rows = (await tx.execute(
      sql`select public.current_business_id()::text as business_id`,
    )) as unknown as ReadonlyArray<{ business_id: string | null }>;
    return rows[0]?.business_id ?? null;
  });
}
