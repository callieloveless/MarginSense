/**
 * Unit tests for the line-item suggestion profit preview (add-suggestion-preview). The load-
 * bearing guarantee: the previewed "proposed" EPH equals what the estimate actually shows once
 * the line is accepted — both go through the same engine. Uses the reference business.
 */

import { describe, expect, it } from "vitest";
import { deriveRates, type BusinessRates } from "@/src/engine";
import { type EstimateRow, type LineItemRow } from "@/src/db/schema";
import { type ProposedLineItem } from "@/src/context";
import { computeFromRows } from "./estimate-compute";
import { previewLineItemImpact } from "./suggestion-preview";

// Reference business (constitution §3.3): $60k overhead, $35/hr wage, 25% burden,
// 200 days × 6 billable hrs, $90k income goal, $15k profit target.
function refRates(over: Partial<Parameters<typeof deriveRates>[0]> = {}): BusinessRates {
  return deriveRates({
    annualOverheadCents: 6_000_000,
    ownerWageCentsPerHour: 3_500,
    laborBurdenBp: 2_500,
    workingDaysPerYear: 200,
    billableMinutesPerDay: 360,
    incomeGoalCents: 9_000_000,
    profitTargetCents: 1_500_000,
    ...over,
  });
}

const now = new Date(0);

function est(over: Partial<EstimateRow> = {}): EstimateRow {
  return {
    id: "e1",
    businessId: "b1",
    projectId: "p1",
    versionLabel: "v1",
    isActive: true,
    targetMarginBp: 4_500,
    contingencyBp: 500,
    totalPriceOverrideCents: null,
    createdAt: now,
    updatedAt: now,
    ...over,
  };
}

function line(over: Partial<LineItemRow> & Pick<LineItemRow, "category">): LineItemRow {
  return {
    id: `l-${Math.random()}`,
    businessId: "b1",
    estimateId: "e1",
    description: null,
    laborMinutes: null,
    quantity: null,
    unitCostCents: null,
    priceCents: null,
    sortOrder: 0,
    createdAt: now,
    updatedAt: now,
    ...over,
  };
}

const baseLines: LineItemRow[] = [
  line({ category: "labor", laborMinutes: 3_840 }), // 64 hrs
  line({ category: "material", quantity: 20, unitCostCents: 1_000 }),
];

const proposedMaterial: ProposedLineItem = { category: "material", quantity: 10, unitCostCents: 500 };

describe("previewLineItemImpact", () => {
  it("previews current + proposed EPH and signal", () => {
    const preview = previewLineItemImpact(est(), baseLines, proposedMaterial, refRates());
    expect(preview).not.toBeNull();
    expect(preview!.current.signal.ok).toBe(true);
    expect(preview!.current.computation.rollUp.eph.ok).toBe(true);
    expect(preview!.proposed.computation.rollUp.eph.ok).toBe(true);
  });

  it("proposed EPH equals the EPH after the line is actually added (preview == post-accept)", () => {
    const rates = refRates();
    const preview = previewLineItemImpact(est(), baseLines, proposedMaterial, rates)!;

    // Post-accept: the same proposed values become a real line row on the estimate.
    const accepted = computeFromRows(
      est(),
      [...baseLines, line({ category: "material", quantity: 10, unitCostCents: 500 })],
      rates,
    );
    expect(accepted.ok).toBe(true);
    const previewEph = preview.proposed.computation.rollUp.eph;
    const acceptedEph = accepted.ok ? accepted.value.rollUp.eph : { ok: false as const, reason: "x" };
    expect(previewEph.ok && acceptedEph.ok && previewEph.value).toBe(acceptedEph.ok && acceptedEph.value);
  });

  it("current side matches the estimate without the proposed line", () => {
    const rates = refRates();
    const preview = previewLineItemImpact(est(), baseLines, proposedMaterial, rates)!;
    const asIs = computeFromRows(est(), baseLines, rates);
    const currentEph = preview.current.computation.rollUp.eph;
    const asIsEph = asIs.ok ? asIs.value.rollUp.eph : { ok: false as const, reason: "x" };
    expect(currentEph.ok && asIsEph.ok && currentEph.value).toBe(asIsEph.ok && asIsEph.value);
  });

  it("returns null when the business has no billable capacity to measure against", () => {
    const preview = previewLineItemImpact(est(), baseLines, proposedMaterial, refRates({ workingDaysPerYear: 0 }));
    expect(preview).toBeNull();
  });
});
