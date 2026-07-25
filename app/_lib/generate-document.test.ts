/**
 * Generating a client document from an estimate (add-client-estimate-doc), end to end through the
 * tool against the in-memory backends and a mock model. What it must hold: the document is created
 * **unshared**, its numbers add up, it carries no internal figure, sharing yields a token the
 * public read resolves, revoke stops it, and another business can't reach it.
 */

import { describe, expect, it } from "vitest";
import {
  createMemoryContextBackend,
  createMemoryDocumentBackend,
  createMemoryEstimateBackend,
  createMemoryProjectBackend,
  createMemorySettingsBackend,
  createMemoryToolRunsBackend,
  createTenantDb,
  type TenantDb,
} from "@/src/db/tenant";
import { createMockModelPort } from "@/src/ai";
import { parseClientDocument } from "@/src/document";
import type { BusinessSettingsRow, EstimateRow, LineItemRow, ProjectRow } from "@/src/db/schema";
import { generateClientDocument } from "./generate-document";

const BUSINESS = "biz-a";
const PROJECT = "p-1";
const EST = "est-1";
const NOW = new Date("2026-07-25T12:00:00Z");

const project: ProjectRow = {
  id: PROJECT,
  businessId: BUSINESS,
  clientName: "Jane Homeowner",
  address: "12 Oak St",
  scope: null,
  status: "active",
  createdAt: NOW,
  updatedAt: NOW,
};

const settings: BusinessSettingsRow = {
  id: "s-1",
  businessId: BUSINESS,
  annualOverheadCents: 6_000_000,
  ownerWageCentsPerHour: 3_500,
  laborBurdenBp: 2_500,
  workingDaysPerYear: 200,
  billableMinutesPerDay: 360,
  incomeGoalCents: 9_000_000,
  profitTargetCents: 1_500_000,
  targetMarginBp: 4_500,
  defaultContingencyBp: 500,
  defaultMarkupBp: null,
  defaultTaxRateBp: 825,
  serviceArea: "Austin, TX",
  createdAt: NOW,
  updatedAt: NOW,
};

const estimate: EstimateRow = {
  id: EST,
  businessId: BUSINESS,
  projectId: PROJECT,
  versionLabel: "v1",
  isActive: true,
  targetMarginBp: 4_500,
  contingencyBp: 500,
  totalPriceOverrideCents: null,
  createdAt: NOW,
  updatedAt: NOW,
};

const lines: LineItemRow[] = [
  {
    id: "l-1", businessId: BUSINESS, estimateId: EST, category: "labor", description: "Framing labor",
    laborMinutes: 1_800, quantity: null, unitCostCents: null, priceCents: null, sortOrder: 0,
    createdAt: NOW, updatedAt: NOW,
  },
  {
    id: "l-2", businessId: BUSINESS, estimateId: EST, category: "material", description: "Lumber",
    laborMinutes: null, quantity: 40, unitCostCents: 1_200, priceCents: null, sortOrder: 1,
    createdAt: NOW, updatedAt: NOW,
  },
];

function wire(): { tenantDb: TenantDb; documents: ReturnType<typeof createMemoryDocumentBackend> } {
  const documents = createMemoryDocumentBackend();
  const tenantDb = createTenantDb(BUSINESS, {
    projects: createMemoryProjectBackend([project]),
    settings: createMemorySettingsBackend([settings]),
    estimates: createMemoryEstimateBackend([estimate], lines),
    context: createMemoryContextBackend(),
    toolRuns: createMemoryToolRunsBackend(),
    documents,
  });
  return { tenantDb, documents };
}

const gen = (tenantDb: TenantDb, writeNarrative = false) =>
  generateClientDocument(tenantDb, createMockModelPort(), { projectId: PROJECT, writeNarrative, now: NOW });

describe("generateClientDocument", () => {
  it("creates an unshared document whose numbers add up and leak nothing", async () => {
    const { tenantDb, documents } = wire();

    const result = await gen(tenantDb);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const doc = result.document;
    expect(doc.sharedAt).toBeNull();
    expect(doc.revokedAt).toBeNull();

    const parsed = parseClientDocument(doc.payload);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.value.lines.reduce((a, l) => a + l.priceCents, 0)).toBe(parsed.value.subtotalCents);
      expect(parsed.value.totalCents).toBe(parsed.value.subtotalCents + (parsed.value.taxCents ?? 0));
      expect(parsed.value.businessName).toBe("Test Business"); // memory backend's identity
      expect(parsed.value.preparedOn).toMatch(/2026/);
    }
    expect(JSON.stringify(doc.payload)).not.toMatch(/cost|margin|eph|laborMinutes|quantity|overhead/i);

    // It's not shared, so the public read resolves nothing yet.
    expect(documents.getShareable(doc.shareToken)).toBeNull();
  });

  it("share makes the public read resolve; revoke stops it", async () => {
    const { tenantDb, documents } = wire();
    const result = await gen(tenantDb);
    if (!result.ok) throw new Error(result.error);

    const shared = await tenantDb.shareDocument(result.document.id);
    expect(documents.getShareable(shared!.shareToken)).not.toBeNull();

    await tenantDb.revokeDocument(result.document.id);
    expect(documents.getShareable(shared!.shareToken)).toBeNull();
  });

  it("refuses without an active estimate", async () => {
    const documents = createMemoryDocumentBackend();
    const tenantDb = createTenantDb(BUSINESS, {
      projects: createMemoryProjectBackend([project]),
      settings: createMemorySettingsBackend([settings]),
      estimates: createMemoryEstimateBackend([], []),
      context: createMemoryContextBackend(),
      toolRuns: createMemoryToolRunsBackend(),
      documents,
    });

    const result = await gen(tenantDb);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/active/i);
  });

  it("cannot be reached across tenants", async () => {
    const { tenantDb, documents } = wire();
    const result = await gen(tenantDb);
    if (!result.ok) throw new Error(result.error);

    // Business B over the SAME document backend can't read/share it.
    const b = createTenantDb("biz-b", {
      projects: createMemoryProjectBackend(),
      documents,
    });
    expect(await b.getDocument(result.document.id)).toBeNull();
    expect(await b.shareDocument(result.document.id)).toBeNull();
  });
});

describe("updateDocumentDraft", () => {
  it("edits an unshared draft's narrative, and refuses once shared", async () => {
    const { tenantDb } = wire();
    const result = await gen(tenantDb);
    if (!result.ok) throw new Error(result.error);
    const id = result.document.id;

    const edited = await tenantDb.updateDocumentDraft(id, { intro: "We'll frame and finish the addition." });
    expect((edited!.payload as { intro?: string }).intro).toMatch(/frame and finish/i);

    // Once shared, the snapshot is frozen — no more edits.
    await tenantDb.shareDocument(id);
    expect(await tenantDb.updateDocumentDraft(id, { intro: "too late" })).toBeNull();
  });
});
