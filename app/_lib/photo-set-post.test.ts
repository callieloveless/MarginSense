/**
 * Posting a photo set (revamp-photo-advisor, Stage B): the set + its photos + one `photo` context
 * entry commit together with **no model call** (analysis is a separate step); an empty set is
 * refused; a delete removes the objects, rows, and the context entry — nothing orphaned.
 */

import { describe, expect, it } from "vitest";
import {
  createMemoryContextBackend,
  createMemoryPhotoBackend,
  createMemoryPhotoSetBackend,
  createMemoryPhotoStorageBackend,
  createMemoryProjectBackend,
  createTenantDb,
  type TenantDb,
} from "@/src/db/tenant";
import { deletePhotoSetForProject, postPhotoSetForProject } from "./photo-set-post";

const BUSINESS = "biz-a";
const PROJECT = "p-1";

function wire(): { tenantDb: TenantDb; storage: ReturnType<typeof createMemoryPhotoStorageBackend> } {
  const storage = createMemoryPhotoStorageBackend();
  const tenantDb = createTenantDb(BUSINESS, {
    projects: createMemoryProjectBackend([]),
    photos: createMemoryPhotoBackend(),
    photoSets: createMemoryPhotoSetBackend(),
    photoStorage: storage,
    context: createMemoryContextBackend(),
  });
  return { tenantDb, storage };
}

const photo = (n: number) => ({
  contentType: "image/jpeg",
  bytes: new Uint8Array([n]),
  thumbBytes: new Uint8Array([n, n]),
  width: 800,
  height: 600,
});

describe("postPhotoSetForProject", () => {
  it("stores the set, its photos, and one photo context entry (no model call)", async () => {
    const { tenantDb, storage } = wire();

    const result = await postPhotoSetForProject(tenantDb, {
      projectId: PROJECT,
      caption: "Sink wall, existing outlets",
      photos: [photo(1), photo(2), photo(3)],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.set.caption).toBe("Sink wall, existing outlets");
    expect(result.set.analysisStatus).toBe("analyzing"); // ready for the auto-kicked analysis

    const photos = await tenantDb.listPhotosBySet(result.set.id);
    expect(photos).toHaveLength(3);
    expect(photos.every((p) => p.setId === result.set.id)).toBe(true);
    expect(storage.keys()).toHaveLength(6); // full + thumb per photo

    const entries = await tenantDb.listContextEntries(PROJECT);
    const photoEntries = entries.filter((e) => e.kind === "photo");
    expect(photoEntries).toHaveLength(1); // ONE entry for the set, not one per photo
    expect((photoEntries[0]!.payload as { setId?: string }).setId).toBe(result.set.id);
    expect((photoEntries[0]!.payload as { count?: number }).count).toBe(3);
  });

  it("refuses an empty set", async () => {
    const { tenantDb } = wire();
    const result = await postPhotoSetForProject(tenantDb, { projectId: PROJECT, photos: [] });
    expect(result.ok).toBe(false);
  });

  it("refuses to delete a set through the wrong project (no cross-project delete)", async () => {
    const { tenantDb, storage } = wire();
    const posted = await postPhotoSetForProject(tenantDb, {
      projectId: PROJECT,
      caption: "Backsplash",
      photos: [photo(1)],
    });
    if (!posted.ok) throw new Error("post failed");

    // Same business, but a different project id than the set was posted under.
    const del = await deletePhotoSetForProject(tenantDb, "p-other", posted.set.id);
    expect(del.ok).toBe(false);
    // The set and its object survive untouched.
    expect(await tenantDb.getPhotoSet(posted.set.id)).not.toBeNull();
    expect(storage.keys()).toHaveLength(2);
  });

  it("deleting a set removes its objects, rows, and context entry", async () => {
    const { tenantDb, storage } = wire();
    const posted = await postPhotoSetForProject(tenantDb, {
      projectId: PROJECT,
      caption: "Backsplash",
      photos: [photo(1), photo(2)],
    });
    if (!posted.ok) throw new Error("post failed");

    const del = await deletePhotoSetForProject(tenantDb, PROJECT, posted.set.id);
    expect(del.ok).toBe(true);
    expect(await tenantDb.getPhotoSet(posted.set.id)).toBeNull();
    expect(await tenantDb.listPhotosBySet(posted.set.id)).toHaveLength(0);
    expect(storage.keys()).toHaveLength(0);
    expect((await tenantDb.listContextEntries(PROJECT)).filter((e) => e.kind === "photo")).toHaveLength(0);
  });
});
