"use client";

/**
 * Client-side image preparation (add-photo-capture), shared by every surface that takes a job
 * photo — the job-context uploader and Photo Advisor's capture-and-run.
 *
 * Everything expensive and everything *sensitive* happens on the device, before a byte leaves it:
 *
 * - the image is drawn into a canvas and scaled so its long edge is at most
 *   {@link MAX_LONG_EDGE_PX} — the model's effective vision resolution, and small enough to send
 *   on one bar of signal;
 * - it is re-encoded as JPEG, which **discards EXIF — including the GPS coordinates of a
 *   client's home** (constitution §7). That privacy win is a property of re-encoding, not of a
 *   metadata-stripping step someone could skip;
 * - a {@link THUMB_LONG_EDGE_PX} thumbnail comes out of the same decode, so galleries never
 *   download full-size images.
 *
 * The server re-validates type and size regardless — a client can always lie.
 */

import {
  JPEG_QUALITY,
  MAX_LONG_EDGE_PX,
  STORED_CONTENT_TYPE,
  THUMB_LONG_EDGE_PX,
  scaledDimensions,
} from "@/src/photos";

/** A prepared image can fail for reasons worth explaining (HEIC, a corrupt file). */
export class ImagePrepError extends Error {}

export interface PreparedImage {
  full: Blob;
  thumb: Blob;
  width: number;
  height: number;
}

/** Decode `file` into a bitmap, or explain why we can't (iOS HEIC is the common case). */
async function decode(file: File): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file);
  } catch {
    throw new ImagePrepError(
      "That image format isn't supported — try again with a JPEG or PNG photo.",
    );
  }
}

/** Draw `bitmap` at `size` and encode it as JPEG (the re-encode is what drops EXIF/GPS). */
async function encodeAt(
  bitmap: ImageBitmap,
  size: { width: number; height: number },
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new ImagePrepError("This browser can't prepare photos for upload.");
  ctx.drawImage(bitmap, 0, 0, size.width, size.height);

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, STORED_CONTENT_TYPE, JPEG_QUALITY),
  );
  if (!blob) throw new ImagePrepError("That photo couldn't be prepared. Try taking it again.");
  return blob;
}

/** Downscale + re-encode + thumbnail, in one decode. */
export async function prepareImage(file: File): Promise<PreparedImage> {
  const bitmap = await decode(file);
  try {
    const full = scaledDimensions(bitmap.width, bitmap.height, MAX_LONG_EDGE_PX);
    const thumb = scaledDimensions(bitmap.width, bitmap.height, THUMB_LONG_EDGE_PX);
    return {
      full: await encodeAt(bitmap, full),
      thumb: await encodeAt(bitmap, thumb),
      width: full.width,
      height: full.height,
    };
  } finally {
    bitmap.close();
  }
}

/** Build the form fields a photo upload posts: the two blobs plus the stored dimensions. */
export function photoFormData(prepared: PreparedImage): FormData {
  const body = new FormData();
  body.set("photo", prepared.full, "photo.jpg");
  body.set("thumb", prepared.thumb, "thumb.jpg");
  body.set("width", String(prepared.width));
  body.set("height", String(prepared.height));
  return body;
}
