/**
 * The production `ProjectBackend`: Drizzle SQL that filters and stamps by `business_id`,
 * run inside the authenticated RLS context (`withAuthenticatedTx`). So there are two
 * isolation layers on every query — the app-layer `business_id` predicate here, and the
 * database's RLS policies keyed on `auth.uid()`. The backend is bound to the signed-in
 * user at construction; `TenantDb` supplies the `business_id`.
 */

import { and, asc, desc, eq } from "drizzle-orm";
import {
  businessSettings,
  contextEntries,
  conversationMessages,
  documents,
  estimates,
  lineItems,
  overheadItems,
  projectPhotos,
  projects,
  suggestions,
  toolRuns,
} from "./schema";
import { withAuthenticatedTx, type Db, type Tx } from "./rls";
import { nextStatus, suggestionEffect } from "../context";
import type {
  BusinessId,
  ContextBackend,
  DocumentBackend,
  EstimateBackend,
  EstimatePatch,
  PhotoBackend,
  ProjectBackend,
  SettingsBackend,
  ToolRunsBackend,
} from "./tenant";

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
              serviceArea: row.serviceArea ?? null,
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

/** Line items for one estimate, in display order. */
function lineItemsFor(tx: Tx, businessId: BusinessId, estimateId: string) {
  return tx
    .select()
    .from(lineItems)
    .where(and(eq(lineItems.estimateId, estimateId), eq(lineItems.businessId, businessId)))
    .orderBy(asc(lineItems.sortOrder));
}

/**
 * The production `EstimateBackend`: Drizzle SQL inside the authenticated RLS context. Both
 * isolation layers apply (app-layer `business_id` predicate + RLS policies). `setActive`
 * clears then sets within one transaction, so the one-active-per-project partial unique
 * index is never violated; `replaceLineItems` swaps a version's whole line set atomically.
 */
export function createDrizzleEstimateBackend(db: Db, authUserId: string): EstimateBackend {
  return {
    listByProject(businessId: BusinessId, projectId: string) {
      return withAuthenticatedTx(db, authUserId, (tx) =>
        tx
          .select()
          .from(estimates)
          .where(and(eq(estimates.projectId, projectId), eq(estimates.businessId, businessId)))
          .orderBy(desc(estimates.createdAt)),
      );
    },
    getById(businessId: BusinessId, id: string) {
      return withAuthenticatedTx(db, authUserId, async (tx) => {
        const found = await tx
          .select()
          .from(estimates)
          .where(and(eq(estimates.id, id), eq(estimates.businessId, businessId)))
          .limit(1);
        return found[0] ?? null;
      });
    },
    insert(row) {
      return withAuthenticatedTx(db, authUserId, async (tx) => {
        const inserted = await tx.insert(estimates).values(row).returning();
        return inserted[0]!;
      });
    },
    update(businessId: BusinessId, id: string, patch: EstimatePatch) {
      return withAuthenticatedTx(db, authUserId, async (tx) => {
        const set: Record<string, unknown> = { updatedAt: new Date() };
        if (patch.versionLabel !== undefined) set.versionLabel = patch.versionLabel;
        if (patch.targetMarginBp !== undefined) set.targetMarginBp = patch.targetMarginBp;
        if (patch.contingencyBp !== undefined) set.contingencyBp = patch.contingencyBp;
        if (patch.totalPriceOverrideCents !== undefined) {
          set.totalPriceOverrideCents = patch.totalPriceOverrideCents;
        }
        const updated = await tx
          .update(estimates)
          .set(set)
          .where(and(eq(estimates.id, id), eq(estimates.businessId, businessId)))
          .returning();
        return updated[0] ?? null;
      });
    },
    setActive(businessId: BusinessId, projectId: string, estimateId: string) {
      return withAuthenticatedTx(db, authUserId, async (tx) => {
        await tx
          .update(estimates)
          .set({ isActive: false, updatedAt: new Date() })
          .where(and(eq(estimates.projectId, projectId), eq(estimates.businessId, businessId)));
        await tx
          .update(estimates)
          .set({ isActive: true, updatedAt: new Date() })
          .where(and(eq(estimates.id, estimateId), eq(estimates.businessId, businessId)));
      });
    },
    listLineItems(businessId: BusinessId, estimateId: string) {
      return withAuthenticatedTx(db, authUserId, (tx) =>
        lineItemsFor(tx, businessId, estimateId),
      );
    },
    replaceLineItems(businessId: BusinessId, estimateId: string, rows) {
      return withAuthenticatedTx(db, authUserId, async (tx) => {
        await tx
          .delete(lineItems)
          .where(and(eq(lineItems.estimateId, estimateId), eq(lineItems.businessId, businessId)));
        if (rows.length === 0) return [];
        return tx.insert(lineItems).values(rows).returning();
      });
    },
    listActiveWithLines(businessId: BusinessId) {
      return withAuthenticatedTx(db, authUserId, async (tx) => {
        const active = await tx
          .select()
          .from(estimates)
          .where(and(eq(estimates.isActive, true), eq(estimates.businessId, businessId)));
        const result = [];
        for (const estimate of active) {
          const lines = await lineItemsFor(tx, businessId, estimate.id);
          result.push({ estimate, lines });
        }
        return result;
      });
    },
  };
}

/**
 * The production `ContextBackend`: Drizzle SQL inside the authenticated RLS context, so both
 * isolation layers apply. `resolveSuggestion` is the accept/dismiss orchestrator — it loads
 * the suggestion, runs the pure state machine, and (on accept) performs the effect (insert a
 * context entry, or append a line item to the target estimate) AND flips the status in **one
 * transaction**; a failure rolls back both, leaving the suggestion pending.
 */
export function createDrizzleContextBackend(db: Db, authUserId: string): ContextBackend {
  return {
    listEntries(businessId: BusinessId, projectId: string) {
      return withAuthenticatedTx(db, authUserId, (tx) =>
        tx
          .select()
          .from(contextEntries)
          .where(and(eq(contextEntries.projectId, projectId), eq(contextEntries.businessId, businessId)))
          .orderBy(asc(contextEntries.createdAt)),
      );
    },
    addEntry(row) {
      return withAuthenticatedTx(db, authUserId, async (tx) => {
        const inserted = await tx.insert(contextEntries).values(row).returning();
        return inserted[0]!;
      });
    },
    deleteEntry(businessId: BusinessId, id: string) {
      return withAuthenticatedTx(db, authUserId, async (tx) => {
        const deleted = await tx
          .delete(contextEntries)
          .where(and(eq(contextEntries.id, id), eq(contextEntries.businessId, businessId)))
          .returning();
        return deleted[0] ?? null;
      });
    },
    listMessages(businessId: BusinessId, projectId: string) {
      return withAuthenticatedTx(db, authUserId, (tx) =>
        tx
          .select()
          .from(conversationMessages)
          .where(
            and(
              eq(conversationMessages.projectId, projectId),
              eq(conversationMessages.businessId, businessId),
            ),
          )
          .orderBy(asc(conversationMessages.createdAt)),
      );
    },
    addMessage(row) {
      return withAuthenticatedTx(db, authUserId, async (tx) => {
        const inserted = await tx.insert(conversationMessages).values(row).returning();
        return inserted[0]!;
      });
    },
    listSuggestions(businessId: BusinessId, projectId: string, opts) {
      return withAuthenticatedTx(db, authUserId, (tx) => {
        const where = opts?.status
          ? and(
              eq(suggestions.projectId, projectId),
              eq(suggestions.businessId, businessId),
              eq(suggestions.status, opts.status),
            )
          : and(eq(suggestions.projectId, projectId), eq(suggestions.businessId, businessId));
        return tx.select().from(suggestions).where(where).orderBy(desc(suggestions.createdAt));
      });
    },
    getSuggestion(businessId: BusinessId, id: string) {
      return withAuthenticatedTx(db, authUserId, async (tx) => {
        const found = await tx
          .select()
          .from(suggestions)
          .where(and(eq(suggestions.id, id), eq(suggestions.businessId, businessId)))
          .limit(1);
        return found[0] ?? null;
      });
    },
    createSuggestion(row) {
      return withAuthenticatedTx(db, authUserId, async (tx) => {
        const inserted = await tx.insert(suggestions).values(row).returning();
        return inserted[0]!;
      });
    },
    resolveSuggestion(businessId: BusinessId, id: string, action) {
      return withAuthenticatedTx(db, authUserId, async (tx) => {
        const found = await tx
          .select()
          .from(suggestions)
          .where(and(eq(suggestions.id, id), eq(suggestions.businessId, businessId)))
          .limit(1);
        const s = found[0];
        if (!s) return { ok: false as const, error: "Suggestion not found." };

        const transition = nextStatus(s.status, action);
        if (!transition.changed) return { ok: true as const, suggestion: s, committed: null };

        if (action === "dismiss") {
          const [updated] = await tx
            .update(suggestions)
            .set({ status: "dismissed", resolvedAt: new Date(), updatedAt: new Date() })
            .where(eq(suggestions.id, id))
            .returning();
          return { ok: true as const, suggestion: updated!, committed: null };
        }

        const eff = suggestionEffect({
          target: s.target,
          payload: s.payload,
          targetEstimateId: s.targetEstimateId,
        });
        if (!eff.ok) return { ok: false as const, error: eff.error };

        if (eff.effect.kind === "commit_context_entry") {
          await tx.insert(contextEntries).values({
            businessId,
            projectId: s.projectId,
            kind: eff.effect.entryKind,
            payload: eff.effect.payload,
            author: s.author,
            authorTool: s.authorTool,
          });
        } else {
          // Append the proposed line to the target estimate (sort after existing lines).
          const existing = await lineItemsFor(tx, businessId, eff.effect.estimateId);
          const line = eff.effect.line;
          await tx.insert(lineItems).values({
            businessId,
            estimateId: eff.effect.estimateId,
            category: line.category,
            description: line.description ?? null,
            laborMinutes: line.laborMinutes ?? null,
            quantity: line.quantity ?? null,
            unitCostCents: line.unitCostCents ?? null,
            priceCents: line.priceCents ?? null,
            sortOrder: existing.length,
          });
        }

        const [updated] = await tx
          .update(suggestions)
          .set({ status: "accepted", resolvedAt: new Date(), updatedAt: new Date() })
          .where(eq(suggestions.id, id))
          .returning();
        return {
          ok: true as const,
          suggestion: updated!,
          committed: eff.effect.kind === "commit_context_entry" ? "context_entry" : "estimate_line_item",
        };
      });
    },
  };
}

/**
 * The production `ToolRunsBackend`: Drizzle SQL inside the authenticated RLS context, so both
 * isolation layers apply (app-layer `business_id` predicate + RLS policies keyed on
 * `auth.uid()`). Append-only audit — a tool run, once recorded, is never mutated.
 */
export function createDrizzleToolRunsBackend(db: Db, authUserId: string): ToolRunsBackend {
  return {
    listByProject(businessId: BusinessId, projectId: string) {
      return withAuthenticatedTx(db, authUserId, (tx) =>
        tx
          .select()
          .from(toolRuns)
          .where(and(eq(toolRuns.projectId, projectId), eq(toolRuns.businessId, businessId)))
          .orderBy(desc(toolRuns.createdAt)),
      );
    },
    startRun(row) {
      return withAuthenticatedTx(db, authUserId, async (tx) => {
        const inserted = await tx.insert(toolRuns).values(row).returning();
        return inserted[0]!;
      });
    },
    finalizeRun(businessId: BusinessId, id: string, patch) {
      return withAuthenticatedTx(db, authUserId, async (tx) => {
        const updated = await tx
          .update(toolRuns)
          .set({
            status: patch.status,
            inputTokens: patch.inputTokens,
            outputTokens: patch.outputTokens,
            latencyMs: patch.latencyMs,
            completedAt: new Date(),
          })
          .where(and(eq(toolRuns.id, id), eq(toolRuns.businessId, businessId)))
          .returning();
        return updated[0] ?? null;
      });
    },
  };
}

/**
 * The production {@link PhotoBackend} (add-photo-capture): rows only — the bytes live in
 * Supabase Storage behind `PhotoStorageBackend`. Like the others it runs inside
 * `withAuthenticatedTx`, so the app-layer `business_id` predicate and the table's RLS policy
 * both apply. `uploaded_by_auth_id` is stamped from the identity this backend is bound to,
 * which is why the port's insert type omits it — a caller cannot claim to be someone else.
 */
export function createDrizzlePhotoBackend(db: Db, authUserId: string): PhotoBackend {
  return {
    listByProject(businessId: BusinessId, projectId: string) {
      return withAuthenticatedTx(db, authUserId, (tx) =>
        tx
          .select()
          .from(projectPhotos)
          .where(
            and(eq(projectPhotos.projectId, projectId), eq(projectPhotos.businessId, businessId)),
          )
          .orderBy(desc(projectPhotos.createdAt)),
      );
    },
    getById(businessId: BusinessId, id: string) {
      return withAuthenticatedTx(db, authUserId, async (tx) => {
        const found = await tx
          .select()
          .from(projectPhotos)
          .where(and(eq(projectPhotos.id, id), eq(projectPhotos.businessId, businessId)))
          .limit(1);
        return found[0] ?? null;
      });
    },
    insert(row) {
      return withAuthenticatedTx(db, authUserId, async (tx) => {
        const inserted = await tx
          .insert(projectPhotos)
          .values({ ...row, uploadedByAuthId: authUserId })
          .returning();
        return inserted[0]!;
      });
    },
    updateCaption(businessId: BusinessId, id: string, caption: string | null) {
      return withAuthenticatedTx(db, authUserId, async (tx) => {
        const updated = await tx
          .update(projectPhotos)
          .set({ caption, updatedAt: new Date() })
          .where(and(eq(projectPhotos.id, id), eq(projectPhotos.businessId, businessId)))
          .returning();
        return updated[0] ?? null;
      });
    },
    deleteById(businessId: BusinessId, id: string) {
      return withAuthenticatedTx(db, authUserId, async (tx) => {
        const deleted = await tx
          .delete(projectPhotos)
          .where(and(eq(projectPhotos.id, id), eq(projectPhotos.businessId, businessId)))
          .returning();
        return deleted[0] ?? null;
      });
    },
  };
}

/**
 * The production {@link DocumentBackend} (add-client-document): client documents, inside
 * `withAuthenticatedTx` so the app-layer `business_id` predicate and the table's RLS policy both
 * apply. The public token read does NOT go through here — it uses the `get_shared_document`
 * SECURITY DEFINER function via the anon client (`src/db/share.ts`), the one path that returns a
 * document without a tenant session.
 */
export function createDrizzleDocumentBackend(db: Db, authUserId: string): DocumentBackend {
  return {
    listByProject(businessId: BusinessId, projectId: string) {
      return withAuthenticatedTx(db, authUserId, (tx) =>
        tx
          .select()
          .from(documents)
          .where(and(eq(documents.projectId, projectId), eq(documents.businessId, businessId)))
          .orderBy(desc(documents.createdAt)),
      );
    },
    getById(businessId: BusinessId, id: string) {
      return withAuthenticatedTx(db, authUserId, async (tx) => {
        const found = await tx
          .select()
          .from(documents)
          .where(and(eq(documents.id, id), eq(documents.businessId, businessId)))
          .limit(1);
        return found[0] ?? null;
      });
    },
    insert(row) {
      return withAuthenticatedTx(db, authUserId, async (tx) => {
        const inserted = await tx.insert(documents).values(row).returning();
        return inserted[0]!;
      });
    },
    setShared(businessId: BusinessId, id: string, token: string) {
      return withAuthenticatedTx(db, authUserId, async (tx) => {
        const updated = await tx
          .update(documents)
          .set({ shareToken: token, sharedAt: new Date(), revokedAt: null, updatedAt: new Date() })
          .where(and(eq(documents.id, id), eq(documents.businessId, businessId)))
          .returning();
        return updated[0] ?? null;
      });
    },
    setRevoked(businessId: BusinessId, id: string) {
      return withAuthenticatedTx(db, authUserId, async (tx) => {
        const updated = await tx
          .update(documents)
          .set({ revokedAt: new Date(), updatedAt: new Date() })
          .where(and(eq(documents.id, id), eq(documents.businessId, businessId)))
          .returning();
        return updated[0] ?? null;
      });
    },
  };
}
