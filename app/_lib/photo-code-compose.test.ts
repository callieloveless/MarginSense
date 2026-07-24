/**
 * The live `photo-advisor → code-finder` compose edge (add-code-finder), end to end through
 * `advisePhoto` → `dispatchAndCompose` against the memory backends and a mock model. This is where
 * 9a's dormant seam and 9b's tool meet: a photo diagnosis fans out to a code lookup per
 * code-relevant finding, no user retyping.
 *
 * The mock returns a schema-appropriate result per call (vision for the Photo Advisor run, codes
 * for each composed Code Finder run), so the composed runs actually succeed and land `code_ref`
 * suggestions — the realistic path.
 */

import { describe, expect, it, vi } from "vitest";
import {
  createMemoryContextBackend,
  createMemoryEstimateBackend,
  createMemoryPhotoBackend,
  createMemoryPhotoStorageBackend,
  createMemoryProjectBackend,
  createMemorySettingsBackend,
  createMemoryToolRunsBackend,
  createTenantDb,
  type TenantDb,
} from "@/src/db/tenant";
import { createMockModelPort, type ModelPort, type ModelRequest } from "@/src/ai";
import { type CodeResult, type VisionResult } from "@/src/tools";
import { advisePhoto } from "./photo-advise";
import { storePhotoForProject } from "./photo-upload";

const BUSINESS = "biz-a";
const PROJECT = "p-1";
const SERVICE_AREA = "Travis County, TX";

/** Two code-relevant findings (safety, attention) and one cosmetic note — so exactly two should
 * compose a Code Finder run. */
const vision: VisionResult = {
  findings: [
    { summary: "Rot at the joist end", severity: "safety", materials: ["2x8 sister"] },
    { summary: "Attic ventilation looks short", severity: "attention" },
    { summary: "Minor surface mould on the subfloor", severity: "note" },
  ],
  labor: [{ description: "Sister the joist", laborMinutes: 210 }],
};

/** A distinct code per composed query — real findings return different codes, so they don't dedup
 * to one. Keyed off the finding in the prompt. */
function codeResultFor(prompt: string): CodeResult {
  const tag = prompt.includes("Rot at the joist") ? "R507" : "R806";
  return {
    codes: [
      {
        code: `IRC ${tag}.2`,
        requirement: `Requirement ${tag}.`,
        jurisdiction: SERVICE_AREA,
        sourceUrl: `https://codes.iccsafe.org/content/IRC2021/${tag}`,
        complianceNote: "Typically needs a permit and inspection.",
      },
    ],
  };
}

/** A mock whose result depends on the call: Code Finder's request carries `serverTools` (web
 * search), Photo Advisor's carries `images`. Optionally records every request. */
function schemaAwarePort(record?: ModelRequest[]): ModelPort {
  return createMockModelPort({
    result: (request: ModelRequest) => {
      record?.push(request);
      if ((request.serverTools?.length ?? 0) === 0) return vision;
      return codeResultFor(String(request.messages[0]?.content ?? ""));
    },
  });
}

function wire(): TenantDb {
  return createTenantDb(BUSINESS, {
    projects: createMemoryProjectBackend(),
    photos: createMemoryPhotoBackend(),
    photoStorage: createMemoryPhotoStorageBackend(),
    context: createMemoryContextBackend(),
    toolRuns: createMemoryToolRunsBackend(),
    settings: createMemorySettingsBackend(),
    estimates: createMemoryEstimateBackend(),
  });
}

/** Store a photo and set a service area, so a composed Code Finder run has a photo and a
 * jurisdiction. */
async function seed(tenantDb: TenantDb): Promise<string> {
  await tenantDb.saveSettings({
    annualOverheadCents: 6_000_000,
    ownerWageCentsPerHour: 3_500,
    laborBurdenBp: 2_500,
    workingDaysPerYear: 200,
    billableMinutesPerDay: 360,
    incomeGoalCents: 9_000_000,
    profitTargetCents: 1_500_000,
    targetMarginBp: 4_500,
    defaultContingencyBp: 500,
    serviceArea: SERVICE_AREA,
  });
  const stored = await storePhotoForProject(tenantDb, {
    projectId: PROJECT,
    contentType: "image/jpeg",
    bytes: new Uint8Array([1, 2, 3, 4]),
    thumbBytes: new Uint8Array([1]),
    width: 1568,
    height: 1176,
  });
  if (!stored.ok) throw new Error("fixture failed to store a photo");
  return stored.photo.id;
}

describe("photo-advisor → code-finder compose edge", () => {
  it("composes one Code Finder run per code-relevant finding, skipping the note", async () => {
    const tenantDb = wire();
    const photoId = await seed(tenantDb);

    await advisePhoto(tenantDb, schemaAwarePort(), { projectId: PROJECT, photoId });

    const runs = await tenantDb.listToolRuns(PROJECT);
    const advisor = runs.filter((r) => r.toolName === "photo-advisor");
    const code = runs.filter((r) => r.toolName === "code-finder");
    expect(advisor).toHaveLength(1);
    expect(advisor[0]!.source).toBe("user");
    // Two code-relevant findings (safety + attention); the `note` composes nothing.
    expect(code).toHaveLength(2);
    expect(code.every((r) => r.source === "compose")).toBe(true);
    expect(code.every((r) => r.status === "ok")).toBe(true);
  });

  it("passes the finding and the service area into the composed query", async () => {
    const tenantDb = wire();
    const photoId = await seed(tenantDb);
    const requests: ModelRequest[] = [];

    await advisePhoto(tenantDb, schemaAwarePort(requests), { projectId: PROJECT, photoId });

    const codeRequests = requests.filter((r) => (r.serverTools?.length ?? 0) > 0);
    const prompts = codeRequests.map((r) => String(r.messages[0]?.content ?? ""));
    // Jurisdiction resolved app-side from settings, and each finding shapes its own query.
    expect(prompts.every((p) => p.includes(SERVICE_AREA))).toBe(true);
    expect(prompts.some((p) => p.includes("Rot at the joist end"))).toBe(true);
    expect(prompts.some((p) => p.includes("Attic ventilation looks short"))).toBe(true);
  });

  it("lands code_ref suggestions traceable to the photo", async () => {
    const tenantDb = wire();
    const photoId = await seed(tenantDb);
    const photo = await tenantDb.getPhoto(photoId);

    await advisePhoto(tenantDb, schemaAwarePort(), { projectId: PROJECT, photoId });

    const pending = await tenantDb.listPendingSuggestions(PROJECT);
    const codeRefs = pending.filter(
      (s) => (s.payload as { kind?: string }).kind === "code_ref",
    );
    // Two composed runs, each a distinct sourced code → two code_ref suggestions (identical ones
    // would dedup to one — that's the runner's job, covered elsewhere).
    expect(codeRefs).toHaveLength(2);
    for (const s of codeRefs) {
      const payload = (s.payload as { payload: Record<string, unknown> }).payload;
      expect(payload.photoStorageKey).toBe(photo!.storageKey);
      expect(payload.sourceUrl).toContain("iccsafe.org");
      expect(s.authorTool).toBe("code-finder");
    }
  });

  it("a failing code lookup never breaks the photo advice", async () => {
    const tenantDb = wire();
    const photoId = await seed(tenantDb);
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    // A port that gives a valid vision result but an INVALID code result — composed runs fail.
    const brokenCode = createMockModelPort({
      result: (request: ModelRequest) =>
        (request.serverTools?.length ?? 0) > 0 ? { wrong: "shape" } : vision,
    });

    const result = await advisePhoto(tenantDb, brokenCode, { projectId: PROJECT, photoId });

    // The photo advice itself succeeded.
    expect(result.ok).toBe(true);
    const runs = await tenantDb.listToolRuns(PROJECT);
    expect(runs.filter((r) => r.toolName === "photo-advisor")[0]!.status).toBe("ok");
    // Photo Advisor's own suggestions (findings + a labor line only if an active estimate) are
    // intact; no code_ref landed.
    const pending = await tenantDb.listPendingSuggestions(PROJECT);
    expect(pending.some((s) => (s.payload as { kind?: string }).kind === "finding")).toBe(true);
    expect(pending.some((s) => (s.payload as { kind?: string }).kind === "code_ref")).toBe(false);
    // The composed failures were logged, not thrown.
    expect(logged).toHaveBeenCalled();
    logged.mockRestore();
  });
});
