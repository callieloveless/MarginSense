/**
 * The production `ProjectBackend`: Drizzle SQL that filters and stamps by `business_id`,
 * run inside the authenticated RLS context (`withAuthenticatedTx`). So there are two
 * isolation layers on every query — the app-layer `business_id` predicate here, and the
 * database's RLS policies keyed on `auth.uid()`. The backend is bound to the signed-in
 * user at construction; `TenantDb` supplies the `business_id`.
 */

import { and, eq } from "drizzle-orm";
import { projects } from "./schema.js";
import { withAuthenticatedTx, type Db } from "./rls.js";
import type { BusinessId, ProjectBackend } from "./tenant.js";

export function createDrizzleProjectBackend(db: Db, authUserId: string): ProjectBackend {
  return {
    listByBusiness(businessId: BusinessId) {
      return withAuthenticatedTx(db, authUserId, (tx) =>
        tx.select().from(projects).where(eq(projects.businessId, businessId)),
      );
    },
    getByBusiness(businessId: BusinessId, id: string) {
      return withAuthenticatedTx(db, authUserId, async (tx) => {
        const found = await tx
          .select()
          .from(projects)
          .where(and(eq(projects.id, id), eq(projects.businessId, businessId)))
          .limit(1);
        return found[0] ?? null;
      });
    },
    insert(row) {
      return withAuthenticatedTx(db, authUserId, async (tx) => {
        const inserted = await tx.insert(projects).values(row).returning();
        // .returning() guarantees exactly one row for a single-values insert; RLS's
        // WITH CHECK also verifies the row's business matches the caller's.
        return inserted[0]!;
      });
    },
    updateStatusByBusiness(businessId: BusinessId, id: string, status) {
      return withAuthenticatedTx(db, authUserId, async (tx) => {
        const updated = await tx
          .update(projects)
          .set({ status, updatedAt: new Date() })
          .where(and(eq(projects.id, id), eq(projects.businessId, businessId)))
          .returning();
        return updated[0] ?? null;
      });
    },
  };
}
