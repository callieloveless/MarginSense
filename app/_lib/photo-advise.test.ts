/**
 * The photo → Photo Advisor wiring (add-photo-advisor), against the in-memory tenant backends and
 * a mock model. This is the layer the tool's own tests can't reach: reading the stored image
 * tenant-scoped, refusing a photo from another project, handing the right bytes and media type to
 * the model, and turning a run into pending suggestions on the real queue.
 *
 * It exists because a missing `photo.uploaded` emit once shipped through a green suite — the tool
 * was tested and the actions were not.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
import { createMockModelPort, type ModelRequest } from "@/src/ai";
import { photoAdvisorTool, type VisionResult } from "@/src/tools";
import { advisePhoto } from "./photo-advise";
import { COMPOSE_EDGES, type ComposeEdge } from "./compose";
import { storePhotoForProject } from "./photo-upload";

const BUSINESS = "biz-a";
const PROJECT = "p-1";

// These tests exercise advisePhoto in isolation. The live `photo-advisor → code-finder` edge
// (add-code-finder) is exercised by its own integration test; here it would spawn composed runs
// that add tool_runs and console noise unrelated to what each test asserts, so it is unwired for
// the duration and restored after.
let savedEdges: readonly ComposeEdge[] | undefined;
beforeEach(() => {
  savedEdges = COMPOSE_EDGES[photoAdvisorTool.name];
  delete COMPOSE_EDGES[photoAdvisorTool.name];
});
afterEach(() => {
  if (savedEdges !== undefined) COMPOSE_EDGES[photoAdvisorTool.name] = savedEdges;
});

const vision: VisionResult = {
  findings: [
    {
      summary: "Rot at the joist end",
      severity: "safety",
      materials: ["pressure-treated 2x8 sister"],
    },
  ],
  labor: [{ description: "Sister the joist", laborMinutes: 210 }],
};

/** A handle wired with everything the snapshot assembler touches — entries, messages, settings,
 * and estimates — plus photos and tool runs. No active estimate unless a test adds one. */
function wire(): { tenantDb: TenantDb } {
  return {
    tenantDb: createTenantDb(BUSINESS, {
      projects: createMemoryProjectBackend(),
      photos: createMemoryPhotoBackend(),
      photoStorage: createMemoryPhotoStorageBackend(),
      context: createMemoryContextBackend(),
      toolRuns: createMemoryToolRunsBackend(),
      settings: createMemorySettingsBackend(),
      estimates: createMemoryEstimateBackend(),
    }),
  };
}

async function storePhoto(tenantDb: TenantDb, projectId = PROJECT, caption?: string) {
  const stored = await storePhotoForProject(tenantDb, {
    projectId,
    contentType: "image/jpeg",
    bytes: new Uint8Array([1, 2, 3, 4]),
    thumbBytes: new Uint8Array([1]),
    width: 1568,
    height: 1176,
    ...(caption !== undefined ? { caption } : {}),
  });
  if (!stored.ok) throw new Error("fixture failed to store a photo");
  return stored.photo;
}

describe("advisePhoto", () => {
  it("runs on a stored photo and lands pending suggestions on the queue", async () => {
    const { tenantDb } = wire();
    const photo = await storePhoto(tenantDb);

    const result = await advisePhoto(tenantDb, createMockModelPort({ result: vision }), {
      projectId: PROJECT,
      photoId: photo.id,
    });

    expect(result.ok).toBe(true);
    const pending = await tenantDb.listPendingSuggestions(PROJECT);
    // One finding; no line item, because this project has no active estimate.
    expect(pending).toHaveLength(1);
    expect(pending[0]!.target).toBe("context_entry");
    const payload = pending[0]!.payload as { payload: Record<string, unknown> };
    expect(payload.payload.severity).toBe("safety");
    expect(payload.payload.photoStorageKey).toBe(photo.storageKey);
    // Authored by the tool, and traceable to the run that produced it.
    expect(pending[0]!.authorTool).toBe("photo-advisor");
    expect(pending[0]!.toolRunId).not.toBeNull();
  });

  it("sends the stored bytes and the row's media type to the model", async () => {
    const { tenantDb } = wire();
    const photo = await storePhoto(tenantDb, PROJECT, "under the tub");

    let seen: ModelRequest | null = null;
    const mock = createMockModelPort({ result: vision });
    const port = {
      complete: async (request: ModelRequest) => {
        seen = request;
        return mock.complete(request);
      },
    };

    await advisePhoto(tenantDb, port, {
      projectId: PROJECT,
      photoId: photo.id,
      question: "  is this worth sistering?  ",
    });

    const request = seen as ModelRequest | null;
    expect(request?.images?.[0]?.mediaType).toBe("image/jpeg");
    expect(request?.images?.[0]?.dataBase64).toBe(Buffer.from([1, 2, 3, 4]).toString("base64"));
    // The question is trimmed, and the photo's own caption rides along as context.
    const text = String(request?.messages?.[0]?.content ?? "");
    expect(text).toContain("is this worth sistering?");
    expect(text).not.toContain("  is this");
    expect(text).toContain("under the tub");
  });

  it("records a completed tool_run", async () => {
    const { tenantDb } = wire();
    const photo = await storePhoto(tenantDb);

    await advisePhoto(tenantDb, createMockModelPort({ result: vision }), {
      projectId: PROJECT,
      photoId: photo.id,
    });

    const runs = await tenantDb.listToolRuns(PROJECT);
    expect(runs).toHaveLength(1);
    expect(runs[0]!.toolName).toBe("photo-advisor");
    expect(runs[0]!.status).toBe("ok");
  });

  it("refuses a photo id that isn't this project's", async () => {
    const { tenantDb } = wire();
    const elsewhere = await storePhoto(tenantDb, "other-project");

    const result = await advisePhoto(tenantDb, createMockModelPort({ result: vision }), {
      projectId: PROJECT,
      photoId: elsewhere.id,
    });

    expect(result).toEqual({
      ok: false,
      error: "That photo couldn't be read. Try again, or take a new one.",
    });
    expect(await tenantDb.listPendingSuggestions(PROJECT)).toHaveLength(0);
  });

  it("refuses an unknown photo id without running anything", async () => {
    const { tenantDb } = wire();

    const result = await advisePhoto(tenantDb, createMockModelPort({ result: vision }), {
      projectId: PROJECT,
      photoId: "not-a-photo",
    });

    expect(result.ok).toBe(false);
    expect(await tenantDb.listToolRuns(PROJECT)).toHaveLength(0);
  });

  it("reports a plain failure and logs the cause when the run throws", async () => {
    const { tenantDb } = wire();
    const photo = await storePhoto(tenantDb);
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const failing = {
      complete: async () => {
        throw new Error("model exploded");
      },
    };

    const result = await advisePhoto(tenantDb, failing, { projectId: PROJECT, photoId: photo.id });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/didn't finish/i);
    expect(logged).toHaveBeenCalled();
    // The failed run is still recorded, so partial AI spend is never invisible (§7).
    const runs = await tenantDb.listToolRuns(PROJECT);
    expect(runs[0]!.status).toBe("error");
    logged.mockRestore();
  });
});
