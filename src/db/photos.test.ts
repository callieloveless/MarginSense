/**
 * Tenant-isolation tests for job photos (constitution §6.3, §7; add-photo-capture) — the same
 * pattern every business-owned table follows, extended to the **objects**, which live outside
 * Postgres and so outside RLS. Both memory backends hold *every* tenant's rows/objects in one
 * place — exactly the condition the row policy and the `storage.objects` policy defend against
 * — so these prove a handle bound to one business can neither read nor delete another's photo,
 * and that the `business_id` and the storage-key prefix always come from the handle, never
 * input. The database policies themselves are proven separately (deferred `test:rls`).
 */

import { describe, expect, it } from "vitest";
import {
  createMemoryPhotoBackend,
  createMemoryPhotoStorageBackend,
  createMemoryProjectBackend,
  createTenantDb,
  type PhotoStorageBackend,
  type TenantDb,
} from "./tenant";
import { keyBelongsToBusiness } from "../photos";

const BUSINESS_A = "biz-a";
const BUSINESS_B = "biz-b";

const bytes = (n: number) => new Uint8Array(n).fill(7);

/** Two handles over ONE shared row backend and ONE shared object store. */
function sharedTenants(): {
  a: TenantDb;
  b: TenantDb;
  storage: PhotoStorageBackend & { keys(): string[] };
} {
  const photos = createMemoryPhotoBackend();
  const storage = createMemoryPhotoStorageBackend();
  const wire = (businessId: string) =>
    createTenantDb(businessId, {
      projects: createMemoryProjectBackend(),
      photos,
      photoStorage: storage,
    });
  return { a: wire(BUSINESS_A), b: wire(BUSINESS_B), storage };
}

function upload(db: TenantDb, projectId: string, caption?: string) {
  return db.addPhoto({
    projectId,
    contentType: "image/jpeg",
    bytes: bytes(64),
    thumbBytes: bytes(8),
    width: 1568,
    height: 1176,
    ...(caption !== undefined ? { caption } : {}),
  });
}

describe("job photos — storage and identity", () => {
  it("stamps the business from the handle and stores both objects under its prefix", async () => {
    const { a, storage } = sharedTenants();
    const photo = await upload(a, "p-a", "joist under the tub");

    expect(photo.businessId).toBe(BUSINESS_A);
    expect(photo.projectId).toBe("p-a");
    expect(photo.caption).toBe("joist under the tub");
    expect(photo.byteSize).toBe(64);
    expect(photo.storageKey).toBe(`${BUSINESS_A}/p-a/${photo.id}.jpg`);
    expect(photo.thumbKey).toBe(`${BUSINESS_A}/p-a/${photo.id}_thumb.jpg`);
    expect(storage.keys().sort()).toEqual([photo.storageKey, photo.thumbKey].sort());
    for (const key of storage.keys()) expect(keyBelongsToBusiness(BUSINESS_A, key)).toBe(true);
  });

  it("issues a signed URL for its own object and refuses another business's key", async () => {
    const { a, b } = sharedTenants();
    const mine = await upload(a, "p-a");
    const theirs = await upload(b, "p-b");

    expect(await a.signedPhotoUrl(mine.storageKey)).toContain(mine.storageKey);
    // B's key is not under A's prefix — refused before storage is ever asked.
    expect(await a.signedPhotoUrl(theirs.storageKey)).toBeNull();
    expect(await a.signedPhotoUrl("../biz-b/p-b/anything.jpg")).toBeNull();
  });

  it("signs a whole gallery in one call, dropping keys that aren't ours", async () => {
    const { a, b } = sharedTenants();
    const one = await upload(a, "p-a");
    const two = await upload(a, "p-a");
    const theirs = await upload(b, "p-b");

    const signed = await a.signedPhotoUrls([one.thumbKey, two.thumbKey, theirs.thumbKey]);

    expect(signed.get(one.thumbKey)).toContain(one.thumbKey);
    expect(signed.get(two.thumbKey)).toContain(two.thumbKey);
    // Another business's key is absent from the map, not an error that fails the page.
    expect(signed.has(theirs.thumbKey)).toBe(false);
    expect(signed.size).toBe(2);
  });

  it("returns an empty map without touching storage when no key is ours", async () => {
    const { a } = sharedTenants();
    expect(await a.signedPhotoUrls([])).toEqual(new Map());
    expect(await a.signedPhotoUrls(["biz-b/p-b/x.jpg"])).toEqual(new Map());
  });
});

describe("tenant isolation — job photos", () => {
  it("lists only the bound business's photos", async () => {
    const { a, b } = sharedTenants();
    await upload(a, "shared-project-id");
    await upload(b, "shared-project-id");

    const mine = await a.listPhotos("shared-project-id");
    expect(mine).toHaveLength(1);
    expect(mine[0]!.businessId).toBe(BUSINESS_A);
  });

  it("cannot read another business's photo by id", async () => {
    const { a, b } = sharedTenants();
    const theirs = await upload(b, "p-b");
    expect(await a.getPhoto(theirs.id)).toBeNull();
  });

  it("cannot caption another business's photo", async () => {
    const { a, b } = sharedTenants();
    const theirs = await upload(b, "p-b", "theirs");

    expect(await a.setPhotoCaption(theirs.id, "mine now")).toBeNull();
    expect((await b.getPhoto(theirs.id))?.caption).toBe("theirs");
  });

  it("cannot delete another business's photo, and leaves its objects intact", async () => {
    const { a, b, storage } = sharedTenants();
    const theirs = await upload(b, "p-b");

    expect(await a.deletePhoto(theirs.id)).toBeNull();
    expect(await b.getPhoto(theirs.id)).not.toBeNull();
    expect(storage.keys()).toContain(theirs.storageKey);
    expect(storage.keys()).toContain(theirs.thumbKey);
  });
});

describe("job photos — delete and failure handling", () => {
  it("deleting removes the row and both objects", async () => {
    const { a, storage } = sharedTenants();
    const photo = await upload(a, "p-a");

    const deleted = await a.deletePhoto(photo.id);
    expect(deleted?.id).toBe(photo.id);
    expect(await a.getPhoto(photo.id)).toBeNull();
    expect(storage.keys()).toHaveLength(0);
  });

  it("leaves no row and no stray objects when the row insert fails", async () => {
    const storage = createMemoryPhotoStorageBackend();
    const photos = createMemoryPhotoBackend();
    const failing = {
      ...photos,
      insert: async () => {
        throw new Error("row insert failed");
      },
    };
    const db = createTenantDb(BUSINESS_A, {
      projects: createMemoryProjectBackend(),
      photos: failing,
      photoStorage: storage,
    });

    await expect(upload(db, "p-a")).rejects.toThrow("row insert failed");
    expect(storage.keys()).toHaveLength(0);
    expect(await db.listPhotos("p-a")).toHaveLength(0);
  });

  it("refuses to store a photo when object storage is unconfigured", async () => {
    const db = createTenantDb(BUSINESS_A, {
      projects: createMemoryProjectBackend(),
      photos: createMemoryPhotoBackend(),
    });
    expect(db.hasPhotoStorage).toBe(false);
    await expect(upload(db, "p-a")).rejects.toThrow(/photo storage/i);
  });
});
