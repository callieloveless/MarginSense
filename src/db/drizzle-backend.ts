/**
 * The production `ProjectBackend`: Drizzle SQL that filters and stamps by `business_id`,
 * run inside the authenticated RLS context (`withAuthenticatedTx`). So there are two
 * isolation layers on every query — the app-layer `business_id` predicate here, and the
 * database's RLS policies keyed on `auth.uid()`. The backend is bound to the signed-in
 * user at construction; `TenantDb` supplies the `business_id`.
 */

import { and, eq } from "drizzle-orm";
import { businessSettings, overheadItems, projects } from "./schema.js";
import { withAuthenticatedTx, type Db } from "./rls.js";
import type { BusinessId, ProjectBackend, SettingsBackend } from "./tenant.js";

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

/**
 * The production `SettingsBackend`: Drizzle SQL run inside the authenticated RLS context,
 * so both isolation layers apply — the app-layer `business_id` predicate here and the
 * database's RLS policies keyed on `auth.uid()`. `upsert` keeps one settings row per
 * business via the `business_id` unique constraint; `replaceItems` swaps the whole
 * itemization set in a single transaction.
 */
export function createDrizzleSettingsBackend(db: Db, authUserId: string): SettingsBackend {
  return {
    getByBusiness(businessId: BusinessId) {
      return withAuthenticatedTx(db, authUserId, async (tx) => {
        const found = await tx
          .select()
          .from(businessSettings)
          .where(eq(businessSettings.businessId, businessId))
          .limit(1);
        return found[0] ?? null;
      });
    },
    upsert(row) {
      return withAuthenticatedTx(db, authUserId, async (tx) => {
        const inserted = await tx
          .insert(businessSettings)
          .values(row)
          .onConflictDoUpdate({
            target: businessSettings.businessId,
            set: {
              annualOverheadCents: row.annualOverheadCents,
              ownerWageCentsPerHour: row.ownerWageCentsPerHour,
              laborBurdenBp: row.laborBurdenBp,
              workingDaysPerYear: row.workingDaysPerYear,
              billableMinutesPerDay: row.billableMinutesPerDay,
              incomeGoalCents: row.incomeGoalCents,
              profitTargetCents: row.profitTargetCents,
              targetMarginBp: row.targetMarginBp,
              defaultContingencyBp: row.defaultContingencyBp,
              defaultMarkupBp: row.defaultMarkupBp ?? null,
              defaultTaxRateBp: row.defaultTaxRateBp ?? null,
              updatedAt: new Date(),
            },
          })
          .returning();
        // Insert-or-update with .returning() yields exactly one row; RLS's WITH CHECK
        // also verifies the row's business matches the caller's.
        return inserted[0]!;
      });
    },
    listItemsByBusiness(businessId: BusinessId) {
      return withAuthenticatedTx(db, authUserId, (tx) =>
        tx.select().from(overheadItems).where(eq(overheadItems.businessId, businessId)),
      );
    },
    replaceItems(businessId: BusinessId, rows) {
      return withAuthenticatedTx(db, authUserId, async (tx) => {
        await tx.delete(overheadItems).where(eq(overheadItems.businessId, businessId));
        if (rows.length === 0) return [];
        return tx.insert(overheadItems).values(rows).returning();
      });
    },
  };
}
