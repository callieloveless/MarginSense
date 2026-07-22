/**
 * The live Postgres connection (Supabase-hosted). Drizzle over postgres.js — data access
 * is typed SQL, not PostgREST. Auth/session and (later) storage go through Supabase's own
 * client; only the raw data plane lives here.
 *
 * Connect with a role that is **subject to RLS** (not a superuser), so the database's
 * per-business policies are enforced even if application code has a bug (constitution
 * §6.3). The URL and role come from env — never the repo (techstack §7). Importing this
 * module does not connect; the connection is created lazily on first use so unit tests
 * (which use the in-memory backend) never require `DATABASE_URL`.
 */

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { createDrizzleProjectBackend, type Db } from "./drizzle-backend.js";
import type { ProjectBackend } from "./tenant.js";

let cached: { db: Db; backends: { projects: ProjectBackend } } | null = null;

function connect(): { db: Db; backends: { projects: ProjectBackend } } {
  if (cached) return cached;
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Configure the Supabase connection (see src/db/README.md) " +
        "before using the live database.",
    );
  }
  const sql = postgres(url, { prepare: false });
  const db = drizzle(sql) as Db;
  cached = { db, backends: { projects: createDrizzleProjectBackend(db) } };
  return cached;
}

/** The live Drizzle handle. Throws if `DATABASE_URL` is unset. */
export function getDb(): Db {
  return connect().db;
}

/** The live tenant backends, for wiring into `createTenantDb`. Throws if unconfigured. */
export function getBackends(): { projects: ProjectBackend } {
  return connect().backends;
}
