/**
 * Tenant-isolation tests (constitution §6.3; techstack §5) — the pattern every later
 * business-owned table copies. These run with the in-memory backend, which holds *every*
 * tenant's rows in one array; they prove that a handle bound to one business cannot read
 * or write another's, that creation always stamps the bound business, and that a handle
 * cannot be built without a business id. The RLS layer is proven separately by the opt-in
 * `test:rls` suite against a live database.
 */

import { describe, expect, it } from "vitest";
import {
  createMemoryProjectBackend,
  createTenantDb,
} from "./tenant";
import type { ProjectRow } from "./schema";

const BUSINESS_A = "biz-a";
const BUSINESS_B = "biz-b";

function seedRow(over: Partial<ProjectRow> & Pick<ProjectRow, "id" | "businessId">): ProjectRow {
  return {
    clientName: "Client",
    address: null,
    scope: null,
    status: "active",
    jobType: null,
    crewSize: null,
    startWindow: null,
    defaultTargetMarginBp: null,
    defaultContingencyBp: null,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...over,
  };
}

describe("tenant isolation — projects", () => {
  it("lists only the bound business's rows", async () => {
    const backend = createMemoryProjectBackend([
      seedRow({ id: "p-a1", businessId: BUSINESS_A, clientName: "A One" }),
      seedRow({ id: "p-b1", businessId: BUSINESS_B, clientName: "B One" }),
    ]);
    const a = createTenantDb(BUSINESS_A, { projects: backend });

    const rows = await a.listProjects();
    expect(rows.map((r) => r.id)).toEqual(["p-a1"]);
  });

  it("cannot read another business's project by id", async () => {
    const backend = createMemoryProjectBackend([
      seedRow({ id: "p-b1", businessId: BUSINESS_B }),
    ]);
    const a = createTenantDb(BUSINESS_A, { projects: backend });

    expect(await a.getProject("p-b1")).toBeNull();
  });

  it("cannot change another business's project status (no-op)", async () => {
    const backend = createMemoryProjectBackend([
      seedRow({ id: "p-b1", businessId: BUSINESS_B, status: "active" }),
    ]);
    const a = createTenantDb(BUSINESS_A, { projects: backend });

    expect(await a.updateProjectStatus("p-b1", "archived")).toBeNull();
    // B's own handle still sees it untouched.
    const b = createTenantDb(BUSINESS_B, { projects: backend });
    expect((await b.getProject("p-b1"))?.status).toBe("active");
  });

  it("stamps the bound business id on create, ignoring any smuggled value", async () => {
    const backend = createMemoryProjectBackend();
    const a = createTenantDb(BUSINESS_A, { projects: backend });

    // Even if a caller casts extra fields in, only the schema input is used and the
    // business id comes from the handle.
    const created = await a.createProject({
      clientName: "New Job",
      ...({ businessId: BUSINESS_B } as object),
    });

    expect(created.businessId).toBe(BUSINESS_A);
    const b = createTenantDb(BUSINESS_B, { projects: backend });
    expect(await b.listProjects()).toEqual([]);
  });

  it("persists the per-job fields on create, still tenant-isolated", async () => {
    const backend = createMemoryProjectBackend();
    const a = createTenantDb(BUSINESS_A, { projects: backend });

    const created = await a.createProject({
      clientName: "Kitchen job",
      jobType: "Kitchen",
      crewSize: "2",
      startWindow: "Week of Oct 13",
      defaultTargetMarginBp: 3000,
      defaultContingencyBp: 500,
    });

    expect(created.businessId).toBe(BUSINESS_A);
    expect(created.jobType).toBe("Kitchen");
    expect(created.crewSize).toBe("2");
    expect(created.startWindow).toBe("Week of Oct 13");
    expect(created.defaultTargetMarginBp).toBe(3000);
    expect(created.defaultContingencyBp).toBe(500);

    // B cannot see A's project or its fields.
    const b = createTenantDb(BUSINESS_B, { projects: backend });
    expect(await b.getProject(created.id)).toBeNull();
    expect(await b.listProjects()).toEqual([]);
  });

  it("defaults the per-job fields to null when omitted", async () => {
    const backend = createMemoryProjectBackend();
    const a = createTenantDb(BUSINESS_A, { projects: backend });
    const created = await a.createProject({ clientName: "Minimal" });
    expect(created.jobType).toBeNull();
    expect(created.crewSize).toBeNull();
    expect(created.startWindow).toBeNull();
    expect(created.defaultTargetMarginBp).toBeNull();
    expect(created.defaultContingencyBp).toBeNull();
  });

  it("refuses to build a handle without a business id", () => {
    const backend = createMemoryProjectBackend();
    expect(() => createTenantDb("", { projects: backend })).toThrow(/business id/i);
  });
});
