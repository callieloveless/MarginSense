/**
 * The production `ProjectBackend`: Drizzle SQL that filters and stamps by `business_id`
 * in the query itself (never in application memory). This is the first isolation layer;
 * RLS in the database is the second. `TenantDb` is the only caller, and it always passes
 * its own bound `businessId`.
 */

import { and, eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { projects } from "./schema.js";
import type { BusinessId, ProjectBackend } from "./tenant.js";

/** The Drizzle handle. Schema generic left default; queries reference tables directly. */
export type Db = PostgresJsDatabase<Record<string, never>>;

export function createDrizzleProjectBackend(db: Db): ProjectBackend {
  return {
    async listByBusiness(businessId: BusinessId) {
      return db
        .select()
        .from(projects)
        .where(eq(projects.businessId, businessId));
    },
    async getByBusiness(businessId: BusinessId, id: string) {
      const found = await db
        .select()
        .from(projects)
        .where(and(eq(projects.id, id), eq(projects.businessId, businessId)))
        .limit(1);
      return found[0] ?? null;
    },
    async insert(row) {
      const inserted = await db.insert(projects).values(row).returning();
      // .returning() guarantees exactly one row for a single-values insert.
      return inserted[0]!;
    },
    async updateStatusByBusiness(businessId: BusinessId, id: string, status) {
      const updated = await db
        .update(projects)
        .set({ status, updatedAt: new Date() })
        .where(and(eq(projects.id, id), eq(projects.businessId, businessId)))
        .returning();
      return updated[0] ?? null;
    },
  };
}
