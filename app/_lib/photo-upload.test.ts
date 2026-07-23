/**
 * The photo store-and-record commit (add-photo-capture, design §5), against the in-memory
 * tenant backends. What it must guarantee: on success the asset and the job's memory of it both
 * exist; on any failure **neither** does, and no bytes are stranded. Nothing here is a
 * suggestion — uploading is a user action, so the `photo` entry is committed directly (§5).
 */

import { describe, expect, it } from "vitest";
import {
  createMemoryContextBackend,
  createMemoryPhotoBackend,
  createMemoryPhotoStorageBackend,
  createMemoryProjectBackend,
  createTenantDb,
} from "@/src/db/tenant";
import { storePhotoForProject } from "./photo-upload";

const BUSINESS = "biz-a";
const PROJECT = "p-1";

const bytes = (n: number) => new Uint8Array(n).fill(1);

const input = {
  projectId: PROJECT,
  contentType: "image/jpeg",
  bytes: bytes(128),
  thumbBytes: bytes(16),
  width: 1568,
  height: 1176,
};

function wire(overrides: { failEntry?: boolean } = {}) {
  const storage = createMemoryPhotoStorageBackend();
  const photos = createMemoryPhotoBackend();
  const context = createMemoryContextBackend();
  const tenantDb = createTenantDb(BUSINESS, {
    projects: createMemoryProjectBackend(),
    photos,
    photoStorage: storage,
    context: overrides.failEntry
      ? {
          ...context,
          addEntry: async () => {
            throw new Error("context entry write failed");
          },
        }
      : context,
  });
  return { tenantDb, storage, context };
}

describe("storePhotoForProject", () => {
  it("stores the photo and records it in the job's shared context", async () => {
    const { tenantDb, storage } = wire();

    const result = await storePhotoForProject(tenantDb, { ...input, caption: "rot at the sill" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.photo.caption).toBe("rot at the sill");
    expect(storage.keys()).toHaveLength(2); // full-size + thumbnail

    const entries = await tenantDb.listContextEntries(PROJECT);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.kind).toBe("photo");
    expect(entries[0]!.author).toBe("user");
    expect(entries[0]!.payload).toEqual({ storageKey: result.photo.storageKey });

    // A photo is not a proposal: nothing lands in the suggestions queue.
    expect(await tenantDb.listPendingSuggestions(PROJECT)).toHaveLength(0);
  });

  it("treats an empty caption as no caption", async () => {
    const { tenantDb } = wire();
    const result = await storePhotoForProject(tenantDb, { ...input, caption: "" });
    expect(result.ok && result.photo.caption).toBeNull();
  });

  it("rolls the photo back when the context entry can't be written", async () => {
    const { tenantDb, storage } = wire({ failEntry: true });

    const result = await storePhotoForProject(tenantDb, input);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/couldn't be saved/i);
    // No row, no entry, no stray bytes.
    expect(await tenantDb.listPhotos(PROJECT)).toHaveLength(0);
    expect(await tenantDb.listContextEntries(PROJECT)).toHaveLength(0);
    expect(storage.keys()).toHaveLength(0);
  });

  it("reports a plain failure when storage isn't configured, writing nothing", async () => {
    const context = createMemoryContextBackend();
    const tenantDb = createTenantDb(BUSINESS, {
      projects: createMemoryProjectBackend(),
      photos: createMemoryPhotoBackend(),
      context,
    });

    const result = await storePhotoForProject(tenantDb, input);

    expect(result.ok).toBe(false);
    expect(await tenantDb.listContextEntries(PROJECT)).toHaveLength(0);
  });
});
