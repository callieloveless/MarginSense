import { describe, expect, it } from "vitest";
import {
  ACCEPTED_CONTENT_TYPES,
  MAX_LONG_EDGE_PX,
  MAX_UPLOAD_BYTES,
  businessSegmentOf,
  extensionForContentType,
  keyBelongsToBusiness,
  photoObjectKey,
  photoThumbKey,
  scaledDimensions,
  validateUpload,
} from "./photos";

const BUSINESS = "biz-a";
const OTHER_BUSINESS = "biz-b";
const PROJECT = "proj-1";
const PHOTO = "photo-9";

describe("storage key derivation", () => {
  it("prefixes the key with the business and project", () => {
    expect(photoObjectKey(BUSINESS, PROJECT, PHOTO, "image/jpeg")).toBe("biz-a/proj-1/photo-9.jpg");
    expect(photoThumbKey(BUSINESS, PROJECT, PHOTO, "image/jpeg")).toBe(
      "biz-a/proj-1/photo-9_thumb.jpg",
    );
  });

  it("derives the extension from the content type, never a filename", () => {
    expect(extensionForContentType("image/png")).toBe("png");
    expect(extensionForContentType("image/webp")).toBe("webp");
    // Anything else stored is JPEG (what the uploader re-encodes to).
    expect(extensionForContentType("image/jpeg")).toBe("jpg");
    expect(extensionForContentType("application/octet-stream")).toBe("jpg");
  });

  it("keeps the photo and its thumbnail under the same tenant prefix", () => {
    const key = photoObjectKey(BUSINESS, PROJECT, PHOTO, "image/jpeg");
    const thumb = photoThumbKey(BUSINESS, PROJECT, PHOTO, "image/jpeg");
    expect(keyBelongsToBusiness(BUSINESS, key)).toBe(true);
    expect(keyBelongsToBusiness(BUSINESS, thumb)).toBe(true);
  });

  it("refuses a key belonging to another business", () => {
    const theirs = photoObjectKey(OTHER_BUSINESS, PROJECT, PHOTO, "image/jpeg");
    expect(keyBelongsToBusiness(BUSINESS, theirs)).toBe(false);
    expect(businessSegmentOf(theirs)).toBe(OTHER_BUSINESS);
  });

  it("treats a malformed or prefix-less key as belonging to nobody", () => {
    expect(businessSegmentOf("just-a-name.jpg")).toBeNull();
    expect(keyBelongsToBusiness(BUSINESS, "just-a-name.jpg")).toBe(false);
    // A traversal attempt cannot masquerade as this business's prefix.
    expect(keyBelongsToBusiness(BUSINESS, "../biz-b/proj-1/photo-9.jpg")).toBe(false);
  });
});

describe("upload validation", () => {
  it("accepts every declared image type at a sane size", () => {
    for (const contentType of ACCEPTED_CONTENT_TYPES) {
      expect(validateUpload({ contentType, byteSize: 250_000 })).toEqual({ ok: true });
    }
  });

  it("rejects a non-image", () => {
    const result = validateUpload({ contentType: "application/pdf", byteSize: 1_000 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/supported image/i);
  });

  it("rejects an empty file", () => {
    expect(validateUpload({ contentType: "image/jpeg", byteSize: 0 }).ok).toBe(false);
  });

  it("accepts exactly the cap and rejects one byte over", () => {
    expect(validateUpload({ contentType: "image/jpeg", byteSize: MAX_UPLOAD_BYTES }).ok).toBe(true);
    const over = validateUpload({ contentType: "image/jpeg", byteSize: MAX_UPLOAD_BYTES + 1 });
    expect(over.ok).toBe(false);
    if (!over.ok) expect(over.error).toMatch(/too large/i);
  });
});

describe("scaledDimensions", () => {
  it("scales a landscape photo by its long edge", () => {
    expect(scaledDimensions(4032, 3024, MAX_LONG_EDGE_PX)).toEqual({ width: 1568, height: 1176 });
  });

  it("scales a portrait photo by its long edge", () => {
    expect(scaledDimensions(3024, 4032, MAX_LONG_EDGE_PX)).toEqual({ width: 1176, height: 1568 });
  });

  it("scales a square photo", () => {
    expect(scaledDimensions(2000, 2000, 400)).toEqual({ width: 400, height: 400 });
  });

  it("leaves an already-small photo alone (never upscales)", () => {
    expect(scaledDimensions(800, 600, MAX_LONG_EDGE_PX)).toEqual({ width: 800, height: 600 });
    expect(scaledDimensions(1568, 20, MAX_LONG_EDGE_PX)).toEqual({ width: 1568, height: 20 });
  });

  it("returns whole pixels of at least 1 for an extreme aspect ratio", () => {
    const { width, height } = scaledDimensions(10_000, 3, 100);
    expect(Number.isInteger(width)).toBe(true);
    expect(Number.isInteger(height)).toBe(true);
    expect(height).toBeGreaterThanOrEqual(1);
    expect(width).toBe(100);
  });
});
