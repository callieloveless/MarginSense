/**
 * Photo Advisor tests (add-photo-advisor), against the mock port with a canned vision result — no
 * key, no network, no real model. What they hold:
 *
 * - a finding becomes a `finding` entry carrying its severity and the photo it came from;
 * - repair labor becomes a line item with the model's minutes **unchanged**;
 * - **no material line item is ever proposed and no payload carries a cost** — the rule that
 *   keeps a fabricated or zero price out of a real estimate (§7);
 * - an implausible estimate is proposed *and* called out, never dropped;
 * - with no active estimate, findings still land and the post says why the work didn't;
 * - every run carries the licensed-professional disclaimer (§5, §7).
 */

import { describe, expect, it } from "vitest";
import { createMockModelPort } from "../../ai";
import { buildProjectSnapshot, type ProjectSnapshot } from "../../context";
import { photoAdvisorTool } from "./photo-advisor";
import { IMPLAUSIBLE_LABOR_MINUTES } from "./suggestions";
import { type PhotoAdvisorInput, type VisionResult } from "./schema";
import { PHYSICAL_WORK_DISCLAIMER } from "../disclaimer";

const STORAGE_KEY = "biz-a/proj-1/photo-1.jpg";

const input: PhotoAdvisorInput = {
  photoId: "photo-1",
  storageKey: STORAGE_KEY,
  mediaType: "image/jpeg",
  imageBase64: "ZmFrZS1qcGVn",
  caption: "under the tub",
};

const result: VisionResult = {
  findings: [
    {
      summary: "Rot at the joist end where the tub drain leaks",
      detail: "Water staining and soft wood over roughly 18 inches.",
      severity: "safety",
      materials: ["pressure-treated 2x8 sister", "structural screws"],
    },
    { summary: "Minor surface mould on the subfloor", severity: "note" },
  ],
  labor: [
    { description: "Sister the joist", laborMinutes: 210 },
    { description: "Treat and seal the subfloor", laborMinutes: 90 },
  ],
};

function snapshot(activeEstimateId: string | null): ProjectSnapshot {
  return buildProjectSnapshot({
    projectId: "proj-1",
    entries: [],
    conversation: [],
    activeEstimateId,
  });
}

/** Run the tool against the mock port with a canned vision result. */
function run(opts: { activeEstimateId: string | null; result?: VisionResult; input?: PhotoAdvisorInput }) {
  const ai = createMockModelPort({ result: opts.result ?? result });
  return photoAdvisorTool.run({
    snapshot: snapshot(opts.activeEstimateId),
    input: opts.input ?? input,
    ai,
  });
}

describe("Photo Advisor — findings", () => {
  it("proposes each finding with its severity and the photo it came from", async () => {
    const out = await run({ activeEstimateId: "est-1" });
    const findings = (out.suggestions ?? []).filter((s) => s.target === "context_entry");

    expect(findings).toHaveLength(2);
    const first = findings[0]!.payload as { kind: string; payload: Record<string, unknown> };
    expect(first.kind).toBe("finding");
    expect(first.payload.severity).toBe("safety");
    expect(first.payload.photoStorageKey).toBe(STORAGE_KEY);
    expect(first.payload.summary).toMatch(/rot at the joist/i);
  });

  it("folds the materials a repair needs into the finding, not into a line", async () => {
    const out = await run({ activeEstimateId: "est-1" });
    const first = (out.suggestions ?? [])[0]!.payload as { payload: Record<string, unknown> };

    expect(String(first.payload.detail)).toContain("pressure-treated 2x8 sister");
    expect(String(first.payload.detail)).toContain("structural screws");
  });
});

describe("Photo Advisor — never prices anything", () => {
  it("proposes no material line item and no payload carrying a cost", async () => {
    const out = await run({ activeEstimateId: "est-1" });

    for (const suggestion of out.suggestions ?? []) {
      const payload = JSON.stringify(suggestion.payload);
      // The rule that keeps a fabricated or zero price out of a real estimate.
      expect(payload).not.toMatch(/priceCents|unitCostCents/);
      if (suggestion.target === "estimate_line_item") {
        expect((suggestion.payload as { category: string }).category).toBe("labor");
      }
    }
  });

  it("names the materials in its post and hands pricing to Material Finder", async () => {
    const out = await run({ activeEstimateId: "est-1" });
    expect(out.message?.body).toContain("pressure-treated 2x8 sister");
    expect(out.message?.body).toMatch(/Material Finder/);
    expect(out.message?.body).toMatch(/can't price/i);
  });
});

describe("Photo Advisor — repair labor", () => {
  it("proposes labor lines carrying the model's minutes unchanged", async () => {
    const out = await run({ activeEstimateId: "est-1" });
    const lines = (out.suggestions ?? []).filter((s) => s.target === "estimate_line_item");

    expect(lines).toHaveLength(2);
    expect(lines[0]!.targetEstimateId).toBe("est-1");
    expect(lines[0]!.payload).toEqual({
      category: "labor",
      description: "Sister the joist",
      laborMinutes: 210,
    });
  });

  it("proposes findings only when the project has no active estimate", async () => {
    const out = await run({ activeEstimateId: null });
    const suggestions = out.suggestions ?? [];

    expect(suggestions.every((s) => s.target === "context_entry")).toBe(true);
    expect(suggestions).toHaveLength(2);
    expect(out.output.proposedLineItems).toBe(false);
    expect(out.message?.body).toMatch(/no active estimate/i);
  });
});

describe("Photo Advisor — implausible estimates", () => {
  const wild: VisionResult = {
    findings: [{ summary: "Whole floor structure is failing", severity: "safety" }],
    labor: [{ description: "Rebuild the floor system", laborMinutes: IMPLAUSIBLE_LABOR_MINUTES + 1 }],
  };

  it("still proposes an over-range estimate, with the model's real minutes", async () => {
    const out = await run({ activeEstimateId: "est-1", result: wild });
    const lines = (out.suggestions ?? []).filter((s) => s.target === "estimate_line_item");

    // Never dropped and never silently capped: if the repair really is that big, that is the
    // most valuable thing this photo can say about the job.
    expect(lines).toHaveLength(1);
    expect((lines[0]!.payload as { laborMinutes: number }).laborMinutes).toBe(
      IMPLAUSIBLE_LABOR_MINUTES + 1,
    );
  });

  it("calls the estimate out in the post", async () => {
    const out = await run({ activeEstimateId: "est-1", result: wild });
    expect(out.output.flaggedLabor).toEqual(["Rebuild the floor system"]);
    expect(out.message?.body).toMatch(/unusually large/i);
  });

  it("says nothing about plausible estimates", async () => {
    const out = await run({ activeEstimateId: "est-1" });
    expect(out.output.flaggedLabor).toEqual([]);
    expect(out.message?.body).not.toMatch(/unusually large/i);
  });
});

describe("Photo Advisor — safety and contract", () => {
  it("carries the licensed-professional disclaimer on every run", async () => {
    const withFindings = await run({ activeEstimateId: "est-1" });
    const empty = await run({
      activeEstimateId: "est-1",
      result: { findings: [], labor: [] },
    });

    expect(withFindings.message?.disclaimer).toBe(PHYSICAL_WORK_DISCLAIMER);
    expect(empty.message?.disclaimer).toBe(PHYSICAL_WORK_DISCLAIMER);
  });

  it("says so plainly when it can't tell anything from the photo", async () => {
    const out = await run({ activeEstimateId: "est-1", result: { findings: [], labor: [] } });
    expect(out.suggestions ?? []).toHaveLength(0);
    expect(out.message?.body).toMatch(/couldn't tell/i);
  });

  it("sends the image to the model and validates its own output", async () => {
    let sawImage = false;
    const ai = createMockModelPort({ result });
    const spy = {
      complete: async (request: Parameters<typeof ai.complete>[0]) => {
        sawImage = (request.images ?? []).some((i) => i.dataBase64 === input.imageBase64);
        return ai.complete(request);
      },
    };

    const out = await photoAdvisorTool.run({ snapshot: snapshot("est-1"), input, ai: spy });

    expect(sawImage).toBe(true);
    expect(() => photoAdvisorTool.outputSchema.parse(out.output)).not.toThrow();
  });

  it("rejects input that isn't a real photo reference", () => {
    expect(photoAdvisorTool.inputSchema.safeParse({ photoId: "p" }).success).toBe(false);
    expect(
      photoAdvisorTool.inputSchema.safeParse({ ...input, imageBase64: "" }).success,
    ).toBe(false);
  });
});
