/**
 * Tenant-isolation tests for `tool_runs` (constitution §6.3, §7; add-tool-platform) — the
 * same pattern every business-owned table follows. Runs with the in-memory backend, which
 * holds *every* tenant's runs in one array; they prove a handle bound to one business cannot
 * read another's runs and that the stored `business_id` always comes from the handle, never
 * input. The RLS layer is proven separately by the opt-in `test:rls` suite.
 */

import { describe, expect, it } from "vitest";
import {
  createMemoryProjectBackend,
  createMemoryToolRunsBackend,
  createTenantDb,
} from "./tenant";

const BUSINESS_A = "biz-a";
const BUSINESS_B = "biz-b";

function tenantDb(businessId: string) {
  return createTenantDb(businessId, {
    projects: createMemoryProjectBackend(),
    toolRuns: createMemoryToolRunsBackend(),
  });
}

describe("tenant isolation — tool_runs", () => {
  it("lists only the bound business's runs", async () => {
    // One shared backend across both handles — the condition RLS defends against.
    const backend = createMemoryToolRunsBackend();
    const a = createTenantDb(BUSINESS_A, { projects: createMemoryProjectBackend(), toolRuns: backend });
    const b = createTenantDb(BUSINESS_B, { projects: createMemoryProjectBackend(), toolRuns: backend });

    await a.recordToolRun({ projectId: "p-a", toolName: "reference", status: "ok" });
    await b.recordToolRun({ projectId: "p-b", toolName: "reference", status: "ok" });

    expect((await a.listToolRuns("p-a")).map((r) => r.toolName)).toEqual(["reference"]);
    // A cannot see B's run, even by guessing the project id.
    expect(await a.listToolRuns("p-b")).toEqual([]);
  });

  it("stamps the bound business id, ignoring any smuggled value", async () => {
    const a = tenantDb(BUSINESS_A);
    const run = await a.recordToolRun({
      projectId: "p-a",
      toolName: "reference",
      status: "ok",
      // Even if a caller casts a business id in, only the handle's id is stored.
      ...({ businessId: BUSINESS_B } as object),
    });
    expect(run.businessId).toBe(BUSINESS_A);
  });

  it("records a failed run with its accrued cost", async () => {
    const a = tenantDb(BUSINESS_A);
    const run = await a.recordToolRun({
      projectId: "p-a",
      toolName: "reference",
      status: "error",
      inputTokens: 12,
      outputTokens: 0,
      latencyMs: 5,
    });
    expect(run.status).toBe("error");
    expect(run.inputTokens).toBe(12);
  });

  it("throws if the handle wasn't wired with a tool-runs backend", () => {
    const a = createTenantDb(BUSINESS_A, { projects: createMemoryProjectBackend() });
    // The unwired-backend getter throws synchronously, before any promise is returned.
    expect(() => a.listToolRuns("p-a")).toThrow(/tool-runs backend/i);
  });
});
