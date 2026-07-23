/**
 * The photo store-and-record commit (add-photo-capture, design §5), against the in-memory
 * tenant backends. What it must guarantee: on success the asset and the job's memory of it both
 * exist; on any failure **neither** does, and no bytes are stranded. Nothing here is a
 * suggestion — uploading is a user action, so the `photo` entry is committed directly (§5).
 */

import { describe, expect, it, vi } from "vitest";
import {
  createMemoryContextBackend,
  createMemoryPhotoBackend,
  createMemoryPhotoStorageBackend,
  createMemoryProjectBackend,
  createTenantDb,
} from "@/src/db/tenant";
import { deletePhotoForProject, storePhotoForProject } from "./photo-upload";

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
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await storePhotoForProject(tenantDb, input);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/couldn't be saved/i);
    // No row, no entry, no stray bytes.
    expect(await tenantDb.listPhotos(PROJECT)).toHaveLength(0);
    expect(await tenantDb.listContextEntries(PROJECT)).toHaveLength(0);
    expect(storage.keys()).toHaveLength(0);
    // The user gets one plain sentence, but the real cause is never swallowed: without this,
    // a bucket-policy rejection and a flaky signal look identical in production.
    expect(logged).toHaveBeenCalledWith(expect.stringContaining("job context failed"), expect.any(Error));
    logged.mockRestore();
  });

  it("reports a plain failure when storage isn't configured, writing nothing", async () => {
    const context = createMemoryContextBackend();
    const tenantDb = createTenantDb(BUSINESS, {
      projects: createMemoryProjectBackend(),
      photos: createMemoryPhotoBackend(),
      context,
    });
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await storePhotoForProject(tenantDb, input);

    expect(result.ok).toBe(false);
    expect(await tenantDb.listContextEntries(PROJECT)).toHaveLength(0);
    expect(logged).toHaveBeenCalled();
    logged.mockRestore();
  });
});

describe("deletePhotoForProject", () => {
  it("removes the row, both objects, and the photo entry that cited it", async () => {
    const { tenantDb, storage } = wire();
    const stored = await storePhotoForProject(tenantDb, input);
    expect(stored.ok).toBe(true);
    if (!stored.ok) return;

    const result = await deletePhotoForProject(tenantDb, PROJECT, stored.photo.id);

    expect(result.ok).toBe(true);
    expect(await tenantDb.listPhotos(PROJECT)).toHaveLength(0);
    expect(storage.keys()).toHaveLength(0);
    // The job's memory must not keep citing a storage key whose bytes are gone — deleting a
    // photo is often a privacy action, and a dangling entry would defeat it.
    expect(await tenantDb.listContextEntries(PROJECT)).toHaveLength(0);
  });

  it("leaves other photos and unrelated entries alone", async () => {
    const { tenantDb } = wire();
    const keep = await storePhotoForProject(tenantDb, input);
    const drop = await storePhotoForProject(tenantDb, input);
    await tenantDb.addContextEntry({
      projectId: PROJECT,
      kind: "fact",
      payload: { label: "Access", value: "Gate code 1234" },
    });
    expect(keep.ok && drop.ok).toBe(true);
    if (!keep.ok || !drop.ok) return;

    await deletePhotoForProject(tenantDb, PROJECT, drop.photo.id);

    const photos = await tenantDb.listPhotos(PROJECT);
    expect(photos.map((p) => p.id)).toEqual([keep.photo.id]);

    const entries = await tenantDb.listContextEntries(PROJECT);
    expect(entries).toHaveLength(2);
    expect(entries.filter((e) => e.kind === "photo")).toHaveLength(1);
    expect(entries.find((e) => e.kind === "photo")?.payload).toEqual({
      storageKey: keep.photo.storageKey,
    });
  });

  it("reports not-found for another business's photo id", async () => {
    const { tenantDb } = wire();
    const result = await deletePhotoForProject(tenantDb, PROJECT, "someone-elses-photo");
    expect(result).toEqual({ ok: false, error: "Photo not found." });
  });
});
