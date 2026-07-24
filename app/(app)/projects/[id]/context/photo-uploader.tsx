"use client";

import { useRef, useState } from "react";
import { MAX_UPLOAD_BYTES } from "@/src/photos";
import { fileInputClassName, inputClassName } from "@/app/_components/fields";
import { ImagePrepError, photoFormData, prepareImage } from "@/app/_lib/prepare-image";
import { uploadPhotoAction, type PhotoActionResult } from "./photo-actions";

/**
 * The job-photo uploader (add-photo-capture) — phone-first: take a photo on site, add a note,
 * upload. The downscale, EXIF strip, and thumbnail all happen on the device via the shared
 * `prepare-image` helper (which Photo Advisor's capture-and-run uses too); the server
 * re-validates type and size regardless, because a client can always lie.
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

      const body = photoFormData(prepared);
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
        <span className="sr-only">Take or choose a job photo</span>
        {/* No `capture` attribute on purpose: it forces the camera and hides the library, so a
            photo already taken on site — the common case when you're back at the truck — would
            be unreachable. Without it the picker still offers the camera on both platforms. */}
        <input
          ref={fileRef}
          type="file"
          name="file"
          accept="image/*"
          onChange={(e) => setFileName(e.currentTarget.files?.[0]?.name ?? "")}
          className={fileInputClassName}
        />
      </label>
      <input
        name="caption"
        placeholder="What is this? (optional — e.g. joist under the tub)"
        className={inputClassName}
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
