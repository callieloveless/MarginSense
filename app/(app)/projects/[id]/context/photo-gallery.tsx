"use client";

import { useActionState, useState } from "react";
import { inputClassName } from "@/app/_components/fields";
import {
  deletePhotoAction,
  setPhotoCaptionAction,
  signedPhotoUrlAction,
  type PhotoActionResult,
} from "./photo-actions";

/** One photo as the gallery needs it: identity, a signed thumbnail URL, its caption, and the
 * stored pixel dimensions (so a tile reserves the right space before its image loads). */
export interface PhotoView {
  id: string;
  caption: string | null;
  /** Short-lived signed URL, or null when the object couldn't be signed (missing/refused). */
  thumbUrl: string | null;
  width: number;
  height: number;
}

/**
 * A job's photos (add-photo-capture) — a phone-first grid of thumbnails, each openable
 * full-size, captionable, and deletable. Every URL is a **short-lived signed URL** issued
 * server-side for this tenant's own objects (constitution §7); nothing here is public, and a
 * tile whose object can't be signed says so in words rather than showing a broken image.
 *
 * Opening a photo asks the server for a fresh signature at that moment. Signing full-size URLs
 * during render would mint links that expire before anyone taps them, and falling back to the
 * thumbnail would quietly show a 400px image in place of the real photo — on a surface whose
 * whole job is letting someone look closely at a defect.
 */
export function PhotoGallery({ projectId, photos }: { projectId: string; photos: PhotoView[] }) {
  if (photos.length === 0) {
    return (
      <p className="mt-2 text-sm text-neutral-500">
        No photos yet. Add one above — it stays with this job.
      </p>
    );
  }

  return (
    <ul className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
      {photos.map((photo) => (
        <PhotoTile key={photo.id} projectId={projectId} photo={photo} />
      ))}
    </ul>
  );
}

function PhotoTile({ projectId, photo }: { projectId: string; photo: PhotoView }) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [opening, setOpening] = useState(false);
  const [openError, setOpenError] = useState<string | null>(null);

  /** Open the full-size photo in a new tab with a URL signed right now. The tab is opened
   * synchronously (before the await) so the browser attributes it to the tap and doesn't block
   * it as a popup; its location is filled in once the signature comes back. */
  async function openFullSize(): Promise<void> {
    setOpening(true);
    setOpenError(null);
    const tab = window.open("", "_blank", "noopener,noreferrer");
    try {
      const url = await signedPhotoUrlAction(photo.id);
      if (!url) {
        tab?.close();
        setOpenError("That photo can't be opened right now.");
        return;
      }
      if (tab) tab.location.href = url;
      else window.location.href = url; // popup blocked — fall back to this tab
    } catch {
      tab?.close();
      setOpenError("That photo can't be opened right now.");
    } finally {
      setOpening(false);
    }
  }

  const [captionState, captionAction, savingCaption] = useActionState<
    PhotoActionResult | null,
    FormData
  >(async (_prev, formData) => {
    const result = await setPhotoCaptionAction(projectId, photo.id, formData);
    if (result.ok) setEditing(false);
    return result;
  }, null);

  const [deleteState, deleteAction, deleting] = useActionState<PhotoActionResult | null, FormData>(
    async () => deletePhotoAction(projectId, photo.id),
    null,
  );

  return (
    <li className="overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-800">
      {photo.thumbUrl ? (
        <button
          type="button"
          onClick={openFullSize}
          disabled={opening}
          aria-label={photo.caption ? `Open "${photo.caption}" full size` : "Open photo full size"}
          className="block w-full"
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- signed URLs are short-lived
              and per-request; next/image would cache and re-request them after they expire. */}
          <img
            src={photo.thumbUrl}
            alt={photo.caption ?? "Job photo"}
            width={photo.width}
            height={photo.height}
            className="aspect-square w-full object-cover"
          />
        </button>
      ) : (
        <div className="flex aspect-square w-full items-center justify-center bg-neutral-100 p-2 text-center text-xs text-neutral-500 dark:bg-neutral-900">
          Image unavailable
        </div>
      )}

      <div className="space-y-1 p-2">
        {editing ? (
          <form action={captionAction} className="space-y-1">
            <label className="block">
              <span className="sr-only">Caption for this photo</span>
              <input
                name="caption"
                defaultValue={photo.caption ?? ""}
                placeholder="What is this?"
                className={inputClassName}
              />
            </label>
            <div className="flex gap-1">
              <button
                type="submit"
                disabled={savingCaption}
                className="flex-1 rounded-md bg-neutral-900 px-2 py-1 text-xs font-medium text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900"
              >
                {savingCaption ? "Saving…" : "Save"}
              </button>
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="rounded-md border border-neutral-300 px-2 py-1 text-xs dark:border-neutral-700"
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <>
            <p className="text-sm">
              {photo.caption ?? <span className="text-neutral-500">No caption</span>}
            </p>
            <div className="flex gap-2 text-xs">
              <button type="button" onClick={() => setEditing(true)} className="underline">
                {photo.caption ? "Edit caption" : "Add caption"}
              </button>
              {confirming ? (
                <form action={deleteAction} className="flex gap-2">
                  <button type="submit" disabled={deleting} className="text-red-600 underline">
                    {deleting ? "Deleting…" : "Delete for good"}
                  </button>
                  <button type="button" onClick={() => setConfirming(false)} className="underline">
                    Keep
                  </button>
                </form>
              ) : (
                <button type="button" onClick={() => setConfirming(true)} className="underline">
                  Delete
                </button>
              )}
            </div>
          </>
        )}

        {openError ? <p className="text-xs text-red-600">{openError}</p> : null}
        {captionState && !captionState.ok ? (
          <p className="text-xs text-red-600">{captionState.error}</p>
        ) : null}
        {deleteState && !deleteState.ok ? (
          <p className="text-xs text-red-600">{deleteState.error}</p>
        ) : null}
      </div>
    </li>
  );
}
