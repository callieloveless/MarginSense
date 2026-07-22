/**
 * Tenant-isolation tests for business settings + overhead items (constitution §6.3;
 * add-onboarding). Same shape as `tenant.test.ts`: the in-memory backend holds *every*
 * tenant's rows in shared arrays — the condition RLS defends against — so these prove that
 * a handle bound to one business cannot read or write another's settings or items, and that
 * saves always stamp the bound business. RLS is proven separately by the opt-in `test:rls`
 * suite against a live database.
 */

import { describe, expect, it } from "vitest";
import {
  createMemoryProjectBackend,
  createMemorySettingsBackend,
  createTenantDb,
  type SettingsInput,
} from "./tenant";
import type { BusinessSettingsRow } from "./schema";

const BUSINESS_A = "biz-a";
const BUSINESS_B = "biz-b";

/** The reference business inputs (constitution §3.2 / onboarding spec), already in ints. */
const REFERENCE_INPUT: SettingsInput = {
  annualOverheadCents: 6_000_000,
  ownerWageCentsPerHour: 3_500,
  laborBurdenBp: 2_500,
  workingDaysPerYear: 200,
  billableMinutesPerDay: 360,
  incomeGoalCents: 9_000_000,
  profitTargetCents: 1_500_000,
  targetMarginBp: 4_500,
  defaultContingencyBp: 1_000,
};

/** A handle wired with both backends (projects unused here but the constructor needs it). */
function handle(
  businessId: string,
  settings = createMemorySettingsBackend(),
) {
  return createTenantDb(businessId, {
    projects: createMemoryProjectBackend(),
    settings,
  });
}

function seedSettings(over: Partial<BusinessSettingsRow> & Pick<BusinessSettingsRow, "id" | "businessId">): BusinessSettingsRow {
  return {
    annualOverheadCents: 1,
    ownerWageCentsPerHour: 1,
    laborBurdenBp: 0,
    workingDaysPerYear: 1,
    billableMinutesPerDay: 1,
    incomeGoalCents: 0,
    profitTargetCents: 0,
    targetMarginBp: 0,
    defaultContingencyBp: 0,
    defaultMarkupBp: null,
    defaultTaxRateBp: null,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...over,
  };
}

describe("tenant isolation — business settings", () => {
  it("cannot read another business's settings", async () => {
    const backend = createMemorySettingsBackend([
      seedSettings({ id: "s-b", businessId: BUSINESS_B, annualOverheadCents: 999 }),
    ]);
    const a = handle(BUSINESS_A, backend);

    expect(await a.getSettings()).toBeNull();
  });

  it("stamps the bound business id on save, ignoring any smuggled value", async () => {
    const backend = createMemorySettingsBackend();
    const a = handle(BUSINESS_A, backend);

    const saved = await a.saveSettings({
      ...REFERENCE_INPUT,
      ...({ businessId: BUSINESS_B } as object),
    });

    expect(saved.businessId).toBe(BUSINESS_A);
    // B sees nothing.
    expect(await handle(BUSINESS_B, backend).getSettings()).toBeNull();
  });

  it("keeps one settings row per business (save updates, never duplicates)", async () => {
    const backend = createMemorySettingsBackend();
    const a = handle(BUSINESS_A, backend);

    const first = await a.saveSettings(REFERENCE_INPUT);
    const second = await a.saveSettings({ ...REFERENCE_INPUT, annualOverheadCents: 7_000_000 });

    expect(second.id).toBe(first.id);
    expect((await a.getSettings())?.annualOverheadCents).toBe(7_000_000);
  });

  it("defaults advanced fields to null when the wizard omits them", async () => {
    const a = handle(BUSINESS_A);
    const saved = await a.saveSettings(REFERENCE_INPUT);
    expect(saved.defaultMarkupBp).toBeNull();
    expect(saved.defaultTaxRateBp).toBeNull();
  });
});

describe("tenant isolation — overhead items", () => {
  it("lists and replaces only the bound business's items", async () => {
    const backend = createMemorySettingsBackend();
    const a = handle(BUSINESS_A, backend);
    const b = handle(BUSINESS_B, backend);

    await a.saveOverheadItems([{ name: "Insurance", amountCents: 120_000 }]);
    await b.saveOverheadItems([{ name: "Truck", amountCents: 90_000 }]);

    expect((await a.listOverheadItems()).map((i) => i.name)).toEqual(["Insurance"]);
    // A replacing its items never touches B's.
    await a.saveOverheadItems([{ name: "Insurance", amountCents: 130_000 }, { name: "Tools", amountCents: 40_000 }]);
    expect((await b.listOverheadItems()).map((i) => i.name)).toEqual(["Truck"]);
  });

  it("stamps the bound business id on every saved item", async () => {
    const backend = createMemorySettingsBackend();
    const a = handle(BUSINESS_A, backend);

    const saved = await a.saveOverheadItems([{ name: "Rent", amountCents: 200_000 }]);
    expect(saved.every((i) => i.businessId === BUSINESS_A)).toBe(true);
  });
});

describe("TenantDb without a settings backend", () => {
  it("fails clearly instead of silently allowing unscoped access", () => {
    const projectsOnly = createTenantDb(BUSINESS_A, { projects: createMemoryProjectBackend() });
    expect(() => projectsOnly.getSettings()).toThrow(/settings backend/i);
  });
});
