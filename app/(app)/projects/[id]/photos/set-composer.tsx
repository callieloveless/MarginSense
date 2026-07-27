"use client";

/**
 * The photo-set composer (revamp-photo-advisor) — shoot the whole thing: take several, or pull
 * several from the phone, write ONE caption for the set, and post. Each photo is downscaled +
 * EXIF-stripped on the device (the shared `prepare-image` pass) before a byte leaves it. Posting is
 * reliable and needs no model; the analysis is auto-kicked afterward (Stage C).
 */

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MAX_UPLOAD_BYTES } from "@/src/photos";
import { MAX_ADVISOR_IMAGES } from "@/src/tools";
import { ImagePrepError, prepareImage } from "@/app/_lib/prepare-image";
import { postPhotoSetAction } from "./actions";

export function SetComposer({ projectId }: { projectId: string }) {
  const router = useRouter();
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  function addFrom(input: HTMLInputElement | null) {
    const picked = Array.from(input?.files ?? []);
    if (picked.length > 0) {
      setFiles((prev) => {
        const combined = [...prev, ...picked];
        // A read looks at up to MAX_ADVISOR_IMAGES photos; keep the set to that so what's posted is
        // what's read, and say so rather than silently dropping the extras.
        if (combined.length > MAX_ADVISOR_IMAGES) {
          setNote(`A set is read up to ${MAX_ADVISOR_IMAGES} photos — keeping the first ${MAX_ADVISOR_IMAGES}.`);
          return combined.slice(0, MAX_ADVISOR_IMAGES);
        }
        setNote(null);
        return combined;
      });
    }
    if (input) input.value = ""; // allow re-picking the same file
  }

  async function post() {
    if (files.length === 0) {
      setError("Take or choose at least one photo.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const body = new FormData();
      body.set("caption", caption);
      for (const file of files) {
        const prepared = await prepareImage(file);
        if (prepared.full.size > MAX_UPLOAD_BYTES) {
          setError("One photo is still too large to send. Try a closer shot.");
          setBusy(false);
          return;
        }
        body.append("photo", prepared.full, "photo.jpg");
        body.append("thumb", prepared.thumb, "thumb.jpg");
        body.append("width", String(prepared.width));
        body.append("height", String(prepared.height));
      }
      const result = await postPhotoSetAction(projectId, body);
      if (result.ok) router.push(`/projects/${projectId}/photos/${result.setId}`);
      else setError(result.error);
    } catch (err) {
      setError(
        err instanceof ImagePrepError ? err.message : "Those photos couldn't be prepared. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">
        Shoot the whole thing — wide, then the close-ups. One caption for the set, one read across all
        of it.
      </p>

      <div className="grid grid-cols-2 gap-3">
        <label className="flex cursor-pointer items-center justify-center rounded-xl bg-brand px-4 py-3 text-center text-base font-semibold text-brand-ink">
          📷 Take photos
          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            onChange={() => addFrom(cameraRef.current)}
            className="sr-only"
          />
        </label>
        <label className="flex cursor-pointer items-center justify-center rounded-xl border border-line bg-surface px-4 py-3 text-center text-base font-semibold text-ink">
          + From phone
          <input
            ref={libraryRef}
            type="file"
            accept="image/*"
            multiple
            onChange={() => addFrom(libraryRef.current)}
            className="sr-only"
          />
        </label>
      </div>

      {files.length > 0 ? (
        <div className="space-y-2 rounded-xl border border-line bg-surface p-3">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-ink">
              {files.length} photo{files.length === 1 ? "" : "s"} in this set
            </span>
            <button
              type="button"
              onClick={() => {
                setFiles([]);
                setNote(null);
              }}
              className="text-muted underline"
            >
              Clear
            </button>
          </div>
          {note ? <p className="text-xs text-muted">{note}</p> : null}
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium text-ink-soft">Caption for the set</span>
            <input
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="e.g. Sink wall, existing outlets"
              className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-base text-ink"
            />
          </label>
          <button
            type="button"
            onClick={post}
            disabled={busy}
            className="w-full rounded-xl bg-brand px-3 py-3 text-base font-semibold text-brand-ink disabled:opacity-50"
          >
            {busy ? "Posting…" : "Post set"}
          </button>
          <p className="text-xs text-muted">
            Photos are resized on your phone and their location data is removed before upload. They
            stay private to your business.
          </p>
        </div>
      ) : null}

      {error ? <p className="text-sm text-danger-fg">{error}</p> : null}
    </div>
  );
}
