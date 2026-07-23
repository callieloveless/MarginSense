"use client";

import { useRef, useState } from "react";
import {
  JPEG_QUALITY,
  MAX_LONG_EDGE_PX,
  MAX_UPLOAD_BYTES,
  STORED_CONTENT_TYPE,
  THUMB_LONG_EDGE_PX,
  scaledDimensions,
} from "@/src/photos";
import { uploadPhotoAction, type PhotoActionResult } from "./photo-actions";

/**
 * The job-photo uploader (add-photo-capture) — phone-first: take a photo on site, add a note,
 * upload. Everything expensive happens **on the device**, before a byte leaves it:
 *
 * - the image is drawn into a canvas and scaled so its long edge is at most
 *   {@link MAX_LONG_EDGE_PX} (the model's effective vision resolution, so 8b gains nothing from
 *   more) — small enough to send on one bar of signal;
 * - it is re-encoded as JPEG, which **discards EXIF — including the GPS coordinates of a
 *   client's home** (constitution §7). The privacy win is a property of re-encoding, not of a
 *   metadata-stripping library that could be skipped;
 * - a {@link THUMB_LONG_EDGE_PX} thumbnail comes out of the same pass, so the gallery never
 *   downloads full-size images.
 *
 * The server re-validates type and size regardless — a client can always lie.
 */
export function PhotoUploader({ projectId }: { projectId: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<PhotoActionResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [fileName, setFileName] = useState<string>("");

  async function onSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    // Read the form synchronously: `event.currentTarget` is not valid after an await.
    const caption = new FormData(event.currentTarget).get("caption");
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setState({ ok: false, error: "Choose or take a photo first." });
      return;
    }

    setBusy(true);
    setState(null);
    try {
      const prepared = await prepareImage(file);
      if (prepared.full.size > MAX_UPLOAD_BYTES) {
        setState({ ok: false, error: "That photo is still too large to send. Try a closer shot." });
        return;
      }

      const body = new FormData();
      body.set("photo", prepared.full, "photo.jpg");
      body.set("thumb", prepared.thumb, "thumb.jpg");
      body.set("width", String(prepared.width));
      body.set("height", String(prepared.height));
      if (typeof caption === "string") body.set("caption", caption);

      const result = await uploadPhotoAction(projectId, body);
      setState(result);
      if (result.ok) {
        formRef.current?.reset();
        setFileName("");
      }
    } catch (err) {
      setState({
        ok: false,
        error:
          err instanceof ImagePrepError
            ? err.message
            : "That photo couldn't be prepared. Try taking it again.",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} className="mt-2 space-y-2">
      <label className="block">
        <span className="sr-only">Choose a job photo</span>
        <input
          ref={fileRef}
          type="file"
          name="file"
          accept="image/*"
          capture="environment"
          onChange={(e) => setFileName(e.currentTarget.files?.[0]?.name ?? "")}
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-base file:mr-3 file:rounded file:border-0 file:bg-neutral-900 file:px-3 file:py-1 file:text-white dark:border-neutral-700 dark:bg-neutral-900 dark:file:bg-white dark:file:text-neutral-900"
        />
      </label>
      <input
        name="caption"
        placeholder="What is this? (optional — e.g. joist under the tub)"
        className="w-full min-w-0 rounded-md border border-neutral-300 px-3 py-2 text-base dark:border-neutral-700 dark:bg-neutral-900"
      />
      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-md bg-neutral-900 px-3 py-2 text-base font-medium text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900"
      >
        {busy ? "Adding…" : "Add photo"}
      </button>
      <p className="text-xs text-neutral-500">
        Photos are resized on your phone and their location data is removed before upload. They
        stay private to your business.
      </p>
      {fileName !== "" && !busy ? (
        <p className="text-xs text-neutral-500">Selected: {fileName}</p>
      ) : null}
      {state ? (
        <p className={`text-sm ${state.ok ? "text-green-700 dark:text-green-500" : "text-red-600"}`}>
          {state.ok ? state.message : state.error}
        </p>
      ) : null}
    </form>
  );
}

/** A prepared image can fail for reasons worth explaining (HEIC, corrupt file). */
class ImagePrepError extends Error {}

interface PreparedImage {
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
async function prepareImage(file: File): Promise<PreparedImage> {
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
