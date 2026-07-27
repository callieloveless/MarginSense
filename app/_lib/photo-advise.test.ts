/**
 * The photo set → Photo Advisor wiring (revamp-photo-advisor), against the in-memory tenant
 * backends and a mock model. This is the layer the tool's own tests can't reach: reading a set's
 * stored images tenant-scoped, refusing a set from another project, handing the right bytes and
 * media type to the model, and turning a run into pending suggestions on the real queue.
 *
 * It exists because a missing `photo.uploaded` emit once shipped through a green suite — the tool
 * was tested and the wiring was not.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createMemoryContextBackend,
  createMemoryEstimateBackend,
  createMemoryPhotoBackend,
  createMemoryPhotoSetBackend,
  createMemoryPhotoStorageBackend,
  createMemoryProjectBackend,
  createMemorySettingsBackend,
  createMemoryToolRunsBackend,
  createTenantDb,
  type TenantDb,
} from "@/src/db/tenant";
import { createMockModelPort, type ModelRequest } from "@/src/ai";
import { photoAdvisorTool, type VisionResult } from "@/src/tools";
import { adviseSet } from "./photo-advise";
import { COMPOSE_EDGES, type ComposeEdge } from "./compose";
import { postPhotoSetForProject } from "./photo-set-post";

const BUSINESS = "biz-a";
const PROJECT = "p-1";

// These tests exercise adviseSet in isolation. The live `photo-advisor → code-finder` edge
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
 * and estimates — plus photos, photo sets, and tool runs. No active estimate unless a test adds
 * one. */
function wire(): { tenantDb: TenantDb } {
  return {
    tenantDb: createTenantDb(BUSINESS, {
      projects: createMemoryProjectBackend(),
      photos: createMemoryPhotoBackend(),
      photoSets: createMemoryPhotoSetBackend(),
      photoStorage: createMemoryPhotoStorageBackend(),
      context: createMemoryContextBackend(),
      toolRuns: createMemoryToolRunsBackend(),
      settings: createMemorySettingsBackend(),
      estimates: createMemoryEstimateBackend(),
    }),
  };
}

/** Post a one-photo set (bytes [1,2,3,4]) for a project, optionally captioned, and return its
 * row — the set the advisor reads its images back from. */
async function storeSet(tenantDb: TenantDb, projectId = PROJECT, caption?: string) {
  const posted = await postPhotoSetForProject(tenantDb, {
    projectId,
    ...(caption !== undefined ? { caption } : {}),
    photos: [
      {
        contentType: "image/jpeg",
        bytes: new Uint8Array([1, 2, 3, 4]),
        thumbBytes: new Uint8Array([1]),
        width: 1568,
        height: 1176,
      },
    ],
  });
  if (!posted.ok) throw new Error("fixture failed to store a set");
  return posted.set;
}

describe("adviseSet", () => {
  it("runs on a stored set and lands pending suggestions on the queue", async () => {
    const { tenantDb } = wire();
    const set = await storeSet(tenantDb);

    const result = await adviseSet(tenantDb, createMockModelPort({ result: vision }), {
      projectId: PROJECT,
      setId: set.id,
    });

    expect(result.ok).toBe(true);
    const pending = await tenantDb.listPendingSuggestions(PROJECT);
    // One finding; no line item, because this project has no active estimate.
    expect(pending).toHaveLength(1);
    expect(pending[0]!.target).toBe("context_entry");
    const payload = pending[0]!.payload as { payload: Record<string, unknown> };
    expect(payload.payload.severity).toBe("safety");
    expect(payload.payload.setId).toBe(set.id);
    // Authored by the tool, and traceable to the run that produced it.
    expect(pending[0]!.authorTool).toBe("photo-advisor");
    expect(pending[0]!.toolRunId).not.toBeNull();
  });

  it("sends the stored bytes and the row's media type to the model", async () => {
    const { tenantDb } = wire();
    const set = await storeSet(tenantDb, PROJECT, "under the tub");

    let seen: ModelRequest | null = null;
    const mock = createMockModelPort({ result: vision });
    const port = {
      complete: async (request: ModelRequest) => {
        seen = request;
        return mock.complete(request);
      },
    };

    await adviseSet(tenantDb, port, {
      projectId: PROJECT,
      setId: set.id,
      question: "  is this worth sistering?  ",
    });

    const request = seen as ModelRequest | null;
    expect(request?.images?.[0]?.mediaType).toBe("image/jpeg");
    expect(request?.images?.[0]?.dataBase64).toBe(Buffer.from([1, 2, 3, 4]).toString("base64"));
    // The question is trimmed, and the set's own caption rides along as context.
    const text = String(request?.messages?.[0]?.content ?? "");
    expect(text).toContain("is this worth sistering?");
    expect(text).not.toContain("  is this");
    expect(text).toContain("under the tub");
  });

  it("records a completed tool_run", async () => {
    const { tenantDb } = wire();
    const set = await storeSet(tenantDb);

    await adviseSet(tenantDb, createMockModelPort({ result: vision }), {
      projectId: PROJECT,
      setId: set.id,
    });

    const runs = await tenantDb.listToolRuns(PROJECT);
    expect(runs).toHaveLength(1);
    expect(runs[0]!.toolName).toBe("photo-advisor");
    expect(runs[0]!.status).toBe("ok");
  });

  it("refuses a set id that isn't this project's", async () => {
    const { tenantDb } = wire();
    const elsewhere = await storeSet(tenantDb, "other-project");

    const result = await adviseSet(tenantDb, createMockModelPort({ result: vision }), {
      projectId: PROJECT,
      setId: elsewhere.id,
    });

    expect(result).toEqual({
      ok: false,
      error: "That set couldn't be read. Try again.",
    });
    expect(await tenantDb.listPendingSuggestions(PROJECT)).toHaveLength(0);
  });

  it("refuses an unknown set id without running anything", async () => {
    const { tenantDb } = wire();

    const result = await adviseSet(tenantDb, createMockModelPort({ result: vision }), {
      projectId: PROJECT,
      setId: "not-a-set",
    });

    expect(result.ok).toBe(false);
    expect(await tenantDb.listToolRuns(PROJECT)).toHaveLength(0);
  });

  it("reports a plain failure and logs the cause when the run throws", async () => {
    const { tenantDb } = wire();
    const set = await storeSet(tenantDb);
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const failing = {
      complete: async () => {
        throw new Error("model exploded");
      },
    };

    const result = await adviseSet(tenantDb, failing, { projectId: PROJECT, setId: set.id });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/didn't finish/i);
    expect(logged).toHaveBeenCalled();
    // The failed run is still recorded, so partial AI spend is never invisible (§7).
    const runs = await tenantDb.listToolRuns(PROJECT);
    expect(runs[0]!.status).toBe("error");
    logged.mockRestore();
  });
});
