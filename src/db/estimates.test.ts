/**
 * Tenant-isolation tests for estimates + line items (constitution §6.3; add-estimate-dashboard).
 * Same shape as the other isolation suites: the in-memory backend holds *every* tenant's rows,
 * so these prove a handle bound to one business cannot read or write another's estimates or
 * lines, that creation stamps the bound business, and that the one-active-version rule holds.
 * RLS itself is proven by the opt-in `test:rls` suite against a live database.
 */

import { describe, expect, it } from "vitest";
import {
  createMemoryEstimateBackend,
  createMemoryProjectBackend,
  createTenantDb,
  type TenantBackends,
} from "./tenant.js";

const BUSINESS_A = "biz-a";
const BUSINESS_B = "biz-b";
const PROJECT_A = "proj-a";

function handle(businessId: string, shared: TenantBackends) {
  return createTenantDb(businessId, shared);
}

/** A backend set sharing one estimate backend across both businesses' handles. */
function sharedBackends(): { a: TenantBackends; b: TenantBackends } {
  const estimates = createMemoryEstimateBackend();
  return {
    a: { projects: createMemoryProjectBackend(), estimates },
    b: { projects: createMemoryProjectBackend(), estimates },
  };
}

describe("tenant isolation — estimates", () => {
  it("cannot read another business's estimate", async () => {
    const { a, b } = sharedBackends();
    const bEst = await handle(BUSINESS_B, b).createEstimate({
      projectId: "proj-b",
      versionLabel: "v1",
      targetMarginBp: 4500,
      contingencyBp: 1000,
    });

    expect(await handle(BUSINESS_A, a).getEstimate(bEst.id)).toBeNull();
  });

  it("stamps the bound business id on create", async () => {
    const { a } = sharedBackends();
    const est = await handle(BUSINESS_A, a).createEstimate({
      projectId: PROJECT_A,
      versionLabel: "v1",
      targetMarginBp: 4500,
      contingencyBp: 1000,
      ...({ businessId: BUSINESS_B } as object),
    });
    expect(est.businessId).toBe(BUSINESS_A);
  });

  it("lists only the bound business's estimates for a project", async () => {
    const estimates = createMemoryEstimateBackend();
    const a: TenantBackends = { projects: createMemoryProjectBackend(), estimates };
    const b: TenantBackends = { projects: createMemoryProjectBackend(), estimates };

    await handle(BUSINESS_A, a).createEstimate({ projectId: PROJECT_A, versionLabel: "v1", targetMarginBp: 4500, contingencyBp: 1000 });
    // B reuses the same project id string but is a different tenant — must not see A's rows.
    await handle(BUSINESS_B, b).createEstimate({ projectId: PROJECT_A, versionLabel: "v1", targetMarginBp: 4500, contingencyBp: 1000 });

    expect((await handle(BUSINESS_A, a).listEstimates(PROJECT_A)).every((e) => e.businessId === BUSINESS_A)).toBe(true);
    expect(await handle(BUSINESS_A, a).listEstimates(PROJECT_A)).toHaveLength(1);
  });

  it("keeps exactly one active version per project", async () => {
    const { a } = sharedBackends();
    const db = handle(BUSINESS_A, a);
    const v1 = await db.createEstimate({ projectId: PROJECT_A, versionLabel: "v1", targetMarginBp: 4500, contingencyBp: 1000, isActive: true });
    const v2 = await db.createEstimate({ projectId: PROJECT_A, versionLabel: "v2", targetMarginBp: 4500, contingencyBp: 1000, isActive: true });

    const all = await db.listEstimates(PROJECT_A);
    expect(all.filter((e) => e.isActive).map((e) => e.id)).toEqual([v2.id]);
    expect((await db.getEstimate(v1.id))?.isActive).toBe(false);
  });

  it("scopes line items to the estimate and business", async () => {
    const { a } = sharedBackends();
    const db = handle(BUSINESS_A, a);
    const est = await db.createEstimate({ projectId: PROJECT_A, versionLabel: "v1", targetMarginBp: 4500, contingencyBp: 1000 });

    const saved = await db.saveLineItems(est.id, [
      { category: "labor", laborMinutes: 480 },
      { category: "material", quantity: 4, unitCostCents: 1250 },
    ]);
    expect(saved.every((l) => l.businessId === BUSINESS_A && l.estimateId === est.id)).toBe(true);
    expect(await db.getLineItems(est.id)).toHaveLength(2);
  });

  it("only surfaces the active version's lines in the portfolio feed", async () => {
    const { a } = sharedBackends();
    const db = handle(BUSINESS_A, a);
    const active = await db.createEstimate({ projectId: PROJECT_A, versionLabel: "v1", targetMarginBp: 4500, contingencyBp: 1000, isActive: true });
    const inactive = await db.createEstimate({ projectId: PROJECT_A, versionLabel: "v2", targetMarginBp: 4500, contingencyBp: 1000 });
    await db.saveLineItems(active.id, [{ category: "labor", laborMinutes: 480 }]);
    await db.saveLineItems(inactive.id, [{ category: "labor", laborMinutes: 999 }]);

    const feed = await db.listActiveEstimatesWithLines();
    expect(feed).toHaveLength(1);
    expect(feed[0]!.estimate.id).toBe(active.id);
    expect(feed[0]!.lines).toHaveLength(1);
  });
});

describe("TenantDb without an estimate backend", () => {
  it("fails clearly instead of silently allowing unscoped access", () => {
    const db = createTenantDb(BUSINESS_A, { projects: createMemoryProjectBackend() });
    expect(() => db.listEstimates(PROJECT_A)).toThrow(/estimate backend/i);
  });
});
