/**
 * Tenant-isolation for photo sets (revamp-photo-advisor) — the same guarantee every business-owned
 * table carries (constitution §6.3). Run against the in-memory backend that holds every tenant's
 * rows in one array: a handle bound to one business can't read, restatus, or delete another's set,
 * and creation always stamps the bound business, never input. The RLS layer is proven separately by
 * the live `test:rls` suite.
 */

import { describe, expect, it } from "vitest";
import { createMemoryPhotoSetBackend, createMemoryProjectBackend, createTenantDb } from "./tenant";

const A = "biz-a";
const B = "biz-b";

function handles() {
  const backend = createMemoryPhotoSetBackend();
  const a = createTenantDb(A, { projects: createMemoryProjectBackend(), photoSets: backend });
  const b = createTenantDb(B, { projects: createMemoryProjectBackend(), photoSets: backend });
  return { a, b };
}

describe("tenant isolation — photo sets", () => {
  it("lists only the bound business's sets", async () => {
    const { a, b } = handles();
    const setA = await a.createPhotoSet({ projectId: "p1", caption: "Sink wall" });
    await b.createPhotoSet({ projectId: "p1", caption: "B's set" });

    expect((await a.listPhotoSets("p1")).map((s) => s.id)).toEqual([setA.id]);
    expect((await a.listPhotoSets("p1"))[0]!.caption).toBe("Sink wall");
  });

  it("stamps the bound business id on create, ignoring a smuggled value", async () => {
    const { a } = handles();
    const created = await a.createPhotoSet({
      projectId: "p1",
      ...({ businessId: B } as object),
    });
    expect(created.businessId).toBe(A);
    expect(created.analysisStatus).toBe("analyzing"); // a fresh set starts analyzing
  });

  it("cannot read, restatus, or delete another business's set", async () => {
    const { a, b } = handles();
    const setB = await b.createPhotoSet({ projectId: "p1" });

    expect(await a.getPhotoSet(setB.id)).toBeNull();
    expect(await a.setPhotoSetStatus(setB.id, "done")).toBeNull();
    expect(await a.deletePhotoSet(setB.id)).toBeNull();
    // B's own set is untouched.
    expect((await b.getPhotoSet(setB.id))!.analysisStatus).toBe("analyzing");
  });
});
