/**
 * The live Postgres connection (Supabase-hosted). Drizzle over postgres.js — data access
 * is typed SQL, not PostgREST. Auth/session and (later) storage go through Supabase's own
 * client; only the raw data plane lives here.
 *
 * The connection logs in through the Supabase pooler as one role for every request; each
 * tenant query then drops to the `authenticated` role and sets the caller's identity via
 * `withAuthenticatedTx` (see `rls.ts`), so RLS is enforced per request. The URL and
 * credentials come from env — never the repo (techstack §7). Importing this module does
 * not connect; the connection is created lazily on first use so unit tests (which use the
 * in-memory backend) never require `DATABASE_URL`.
 */

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import type { Db } from "./rls";

let cachedDb: Db | null = null;

/** The live Drizzle handle. Throws if `DATABASE_URL` is unset. `prepare: false` is
 * required by the Supabase transaction pooler. */
export function getDb(): Db {
  if (cachedDb) return cachedDb;
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Configure the Supabase connection (see src/db/README.md) " +
        "before using the live database.",
    );
  }
  const sql = postgres(url, { prepare: false });
  cachedDb = drizzle(sql) as Db;
  return cachedDb;
}
