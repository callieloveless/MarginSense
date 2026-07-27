/**
 * Version duplication and save reconciliation (revamp-estimate-editor, Stage C). Duplicating copies
 * inputs + lines (including entered per-line prices) into a NEW inactive version, leaves the active
 * one alone, and is tenant-isolated. `lineSetChanged` catches a concurrently-added line so a
 * full-replace save can't silently drop it.
 */

import { describe, expect, it } from "vitest";
import {
  createMemoryEstimateBackend,
  createMemoryProjectBackend,
  createTenantDb,
  type TenantDb,
} from "@/src/db/tenant";
import type { EstimateRow, LineItemRow } from "@/src/db/schema";
import { duplicateEstimate, lineSetChanged } from "./estimate-edit";

const BUSINESS = "biz-a";
const PROJECT = "p-1";
const NOW = new Date("2026-07-26T00:00:00Z");

const source: EstimateRow = {
  id: "est-1",
  businessId: BUSINESS,
  projectId: PROJECT,
  versionLabel: "v1",
  isActive: true,
  targetMarginBp: 4_500,
  contingencyBp: 500,
  totalPriceOverrideCents: 250_000,
  createdAt: NOW,
  updatedAt: NOW,
};

const sourceLines: LineItemRow[] = [
  {
    id: "l-1", businessId: BUSINESS, estimateId: "est-1", category: "labor", description: "Framing",
    laborMinutes: 600, quantity: null, unitCostCents: null, priceCents: 60_000, sortOrder: 0,
    createdAt: NOW, updatedAt: NOW,
  },
  {
    id: "l-2", businessId: BUSINESS, estimateId: "est-1", category: "material", description: "Lumber",
    laborMinutes: null, quantity: 40, unitCostCents: 1_200, priceCents: null, sortOrder: 1,
    createdAt: NOW, updatedAt: NOW,
  },
];

function wire(): TenantDb {
  return createTenantDb(BUSINESS, {
    projects: createMemoryProjectBackend([]),
    estimates: createMemoryEstimateBackend([source], sourceLines),
  });
}

describe("duplicateEstimate", () => {
  it("creates a new inactive version copying inputs and lines incl. entered prices", async () => {
    const db = wire();
    const copy = await duplicateEstimate(db, PROJECT, "est-1");
    expect(copy).not.toBeNull();
    expect(copy!.id).not.toBe("est-1");
    expect(copy!.isActive).toBe(false); // does not steal active
    expect(copy!.versionLabel).toBe("Copy of v1");
    expect(copy!.targetMarginBp).toBe(4_500);
    expect(copy!.contingencyBp).toBe(500);
    expect(copy!.totalPriceOverrideCents).toBe(250_000);

    const copiedLines = await db.getLineItems(copy!.id);
    expect(copiedLines.map((l) => l.priceCents)).toEqual([60_000, null]); // entered price carried
    expect(copiedLines.map((l) => l.category)).toEqual(["labor", "material"]);

    // The source is untouched and still active.
    expect((await db.getEstimate("est-1"))!.isActive).toBe(true);
  });

  it("is a no-op across tenants", async () => {
    const other = createTenantDb("biz-b", {
      projects: createMemoryProjectBackend([]),
      estimates: createMemoryEstimateBackend([source], sourceLines),
    });
    expect(await other.getEstimate("est-1")).toBeNull(); // can't even see it
    expect(await duplicateEstimate(other, PROJECT, "est-1")).toBeNull();
  });

  it("returns null when the estimate isn't in the named project", async () => {
    const db = wire();
    expect(await duplicateEstimate(db, "other-project", "est-1")).toBeNull();
  });
});

describe("lineSetChanged", () => {
  it("is false when the same ids are present (order and edits don't count)", () => {
    expect(lineSetChanged(["a", "b"], ["b", "a"])).toBe(false);
  });

  it("is true when an id was added (a concurrent suggestion line)", () => {
    expect(lineSetChanged(["a", "b"], ["a", "b", "c"])).toBe(true);
  });

  it("is true when an id was removed", () => {
    expect(lineSetChanged(["a", "b"], ["a"])).toBe(true);
  });
});
