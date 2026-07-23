/**
 * The job-photo domain module (add-photo-capture) — the rules a photo obeys, with no
 * framework, DB, or Supabase imports so they are unit-testable on their own and shared by the
 * client uploader, the server action, and the tenant handle.
 *
 * Two things live here that matter for safety:
 *
 * - **Key derivation is the only way a storage key is built** ({@link photoObjectKey}). The key
 *   is prefixed with the business and project, and every caller passes ids it already holds —
 *   `TenantDb` supplies its own bound `business_id`, so a caller cannot address another
 *   tenant's prefix. The `storage.objects` policy in migration `0007` checks the same first
 *   segment in the database, so this is defense in depth, not the guarantee.
 * - **Limits are named constants** ({@link MAX_UPLOAD_BYTES}, {@link MAX_LONG_EDGE_PX}), so the
 *   client resizer, the server validation, and the Next body-size limit all agree.
 *
 * Photos of a client's home are sensitive (constitution §7): the uploader re-encodes on the
 * device, which discards EXIF (including GPS), and the size/type checks here run again on the
 * server because a client can always lie.
 */

/** Image types the server accepts. The uploader normally re-encodes to JPEG; PNG and WebP are
 * accepted so a direct post of a legitimate image isn't rejected for its container. */
export const ACCEPTED_CONTENT_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type AcceptedContentType = (typeof ACCEPTED_CONTENT_TYPES)[number];

/** What the uploader re-encodes to (JPEG re-encoding is what drops EXIF/GPS). */
export const STORED_CONTENT_TYPE: AcceptedContentType = "image/jpeg";

/** JPEG quality for the re-encode — small enough for one bar of signal, good enough to read a
 * cracked joist. */
export const JPEG_QUALITY = 0.82;

/** Hard cap on a single uploaded object. `next.config.mjs` sets the server-action body limit
 * above this (a photo and its thumbnail travel in one request). */
export const MAX_UPLOAD_BYTES = 6 * 1024 * 1024;

/** The long edge a stored photo is scaled to. 1568px is the model's effective vision
 * resolution (8b gains nothing from more) and keeps uploads small on site. */
export const MAX_LONG_EDGE_PX = 1568;

/** The long edge of the thumbnail produced in the same client-side pass, so the gallery never
 * downloads full-size images. */
export const THUMB_LONG_EDGE_PX = 400;

/** How long a signed photo URL stays valid. Short: a signed URL is a bearer link. */
export const SIGNED_URL_TTL_SECONDS = 60;

/** True when `value` is a content type we accept. */
export function isAcceptedContentType(value: string): value is AcceptedContentType {
  return (ACCEPTED_CONTENT_TYPES as readonly string[]).includes(value);
}

/** The file extension a stored object gets, derived from its content type (never from a
 * client-supplied filename). */
export function extensionForContentType(contentType: string): string {
  switch (contentType) {
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    default:
      return "jpg";
  }
}

/**
 * The storage key for a photo: `"{businessId}/{projectId}/{photoId}.{ext}"`. The leading
 * segment is what the `storage.objects` policy compares against `public.current_business_id()`,
 * so the business id must always come from the tenant handle — never from input.
 */
export function photoObjectKey(
  businessId: string,
  projectId: string,
  photoId: string,
  contentType: string,
): string {
  return `${businessId}/${projectId}/${photoId}.${extensionForContentType(contentType)}`;
}

/** The thumbnail's key, alongside its photo under the same tenant prefix. */
export function photoThumbKey(
  businessId: string,
  projectId: string,
  photoId: string,
  contentType: string,
): string {
  return `${businessId}/${projectId}/${photoId}_thumb.${extensionForContentType(contentType)}`;
}

/** The business segment of a storage key, or null if the key isn't shaped like one. Used to
 * refuse a key that doesn't belong to the calling tenant before it reaches storage. */
export function businessSegmentOf(key: string): string | null {
  const segment = key.split("/")[0];
  return segment !== undefined && segment !== "" && key.includes("/") ? segment : null;
}

/** True when `key` lives under `businessId`'s prefix — the app-layer half of the object
 * isolation rule (the DB policy is the other half). */
export function keyBelongsToBusiness(businessId: string, key: string): boolean {
  return businessSegmentOf(key) === businessId;
}

export type UploadValidation = { ok: true } | { ok: false; error: string };

/**
 * Validate an upload at the server boundary: an accepted image type and within the size cap.
 * Messages are plain language — they're shown to a contractor on a phone, not logged.
 */
export function validateUpload(input: { contentType: string; byteSize: number }): UploadValidation {
  if (!isAcceptedContentType(input.contentType)) {
    return { ok: false, error: "That file isn't a supported image — use a JPEG, PNG, or WebP photo." };
  }
  if (!Number.isInteger(input.byteSize) || input.byteSize <= 0) {
    return { ok: false, error: "That photo appears to be empty. Try taking it again." };
  }
  if (input.byteSize > MAX_UPLOAD_BYTES) {
    const mb = Math.floor(MAX_UPLOAD_BYTES / (1024 * 1024));
    return { ok: false, error: `That photo is too large — keep it under ${mb} MB.` };
  }
  return { ok: true };
}

/** Integer pixel dimensions. */
export interface Dimensions {
  readonly width: number;
  readonly height: number;
}

/**
 * Scale `width`×`height` so its long edge is at most `longEdge`, preserving aspect ratio and
 * returning whole pixels (never below 1). An image already within the bound is unchanged — we
 * never upscale a photo taken in poor light on an old phone.
 */
export function scaledDimensions(width: number, height: number, longEdge: number): Dimensions {
  const w = Math.max(1, Math.floor(width));
  const h = Math.max(1, Math.floor(height));
  const longest = Math.max(w, h);
  if (longest <= longEdge) return { width: w, height: h };
  const scale = longEdge / longest;
  return {
    width: Math.max(1, Math.round(w * scale)),
    height: Math.max(1, Math.round(h * scale)),
  };
}
