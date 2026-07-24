"use client";

import { useRef, useState } from "react";
import { MAX_UPLOAD_BYTES } from "@/src/photos";
import { PHYSICAL_WORK_DISCLAIMER } from "@/src/tools";
import { inputClassName } from "@/app/_components/fields";
import { ImagePrepError, photoFormData, prepareImage } from "@/app/_lib/prepare-image";
import {
  capturePhotoAndAdviseAction,
  runPhotoAdvisorAction,
  type AdvisorActionResult,
} from "./photo-advisor-actions";

/** A photo of this job, as the picker needs it. */
export interface AdvisorPhoto {
  id: string;
  caption: string | null;
  thumbUrl: string | null;
}

/**
 * Photo Advisor's per-tool surface (add-photo-advisor). Two ways in, because a contractor's day
 * has two shapes: **take a photo and ask about it right now** (on the ladder), or **ask about one
 * already on the job** (back at the truck). There is no separate upload screen between having a
 * photo and getting an answer.
 *
 * The disclaimer sits above both, before any run — this tool gives advice about physical work
 * (constitution §5, §7), and the user should see that framing before the first answer, not after.
 */
export function PhotoAdvisorForm({
  projectId,
  photos,
  aiConfigured,
  storageReady,
}: {
  projectId: string;
  photos: AdvisorPhoto[];
  aiConfigured: boolean;
  storageReady: boolean;
}) {
  const [mode, setMode] = useState<"take" | "choose">(photos.length > 0 ? "choose" : "take");
  const [selected, setSelected] = useState<string | null>(photos[0]?.id ?? null);
  const [state, setState] = useState<AdvisorActionResult | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  if (!storageReady) {
    return (
      <Notice>
        Photo storage isn&apos;t connected yet, so there are no job photos to look at.
      </Notice>
    );
  }
  if (!aiConfigured) {
    return (
      <>
        <Disclaimer />
        <Notice>
          Connect AI to have a photo looked at. You can still add photos to the job from{" "}
          <strong>Job context</strong>.
        </Notice>
      </>
    );
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    // Read the form synchronously: `event.currentTarget` is not valid after an await.
    const question = String(new FormData(event.currentTarget).get("question") ?? "");
    setBusy(true);
    setState(null);
    try {
      if (mode === "choose") {
        if (!selected) {
          setState({ ok: false, error: "Pick a photo first." });
          return;
        }
        setState(await runPhotoAdvisorAction(projectId, selected, question));
        return;
      }

      const file = fileRef.current?.files?.[0];
      if (!file) {
        setState({ ok: false, error: "Take or choose a photo first." });
        return;
      }
      const prepared = await prepareImage(file);
      if (prepared.full.size > MAX_UPLOAD_BYTES) {
        setState({ ok: false, error: "That photo is still too large to send. Try a closer shot." });
        return;
      }
      const body = photoFormData(prepared);
      body.set("question", question);
      const result = await capturePhotoAndAdviseAction(projectId, body);
      setState(result);
      if (result.ok) formRef.current?.reset();
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
    <div className="mt-3 space-y-3">
      <Disclaimer />

      <div className="flex gap-2" role="group" aria-label="Which photo to look at">
        <ModeButton active={mode === "take"} onClick={() => setMode("take")}>
          Take a photo
        </ModeButton>
        <ModeButton
          active={mode === "choose"}
          onClick={() => setMode("choose")}
          disabled={photos.length === 0}
        >
          {photos.length === 0 ? "No photos yet" : "Use a job photo"}
        </ModeButton>
      </div>

      <form ref={formRef} onSubmit={onSubmit} className="space-y-2">
        {mode === "take" ? (
          <label className="block">
            <span className="sr-only">Take or choose a job photo</span>
            <input
              ref={fileRef}
              type="file"
              name="file"
              accept="image/*"
              className={`${inputClassName} file:mr-3 file:rounded file:border-0 file:bg-neutral-900 file:px-3 file:py-1 file:text-white dark:file:bg-white dark:file:text-neutral-900`}
            />
          </label>
        ) : (
          <ul className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Job photos">
            {photos.map((photo) => (
              <li key={photo.id}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={selected === photo.id}
                  onClick={() => setSelected(photo.id)}
                  className={`block w-full overflow-hidden rounded-md border-2 ${
                    selected === photo.id
                      ? "border-neutral-900 dark:border-white"
                      : "border-transparent"
                  }`}
                >
                  {photo.thumbUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- signed URLs are
                    // short-lived and per-request; next/image would cache and re-request them.
                    <img
                      src={photo.thumbUrl}
                      alt={photo.caption ?? "Job photo"}
                      className="aspect-square w-full object-cover"
                    />
                  ) : (
                    <span className="flex aspect-square w-full items-center justify-center bg-neutral-100 p-1 text-center text-[10px] text-neutral-500 dark:bg-neutral-900">
                      Unavailable
                    </span>
                  )}
                  {/* Selection is never colour alone: the chosen photo says so in words. */}
                  <span className="block truncate px-1 py-0.5 text-left text-[11px] text-neutral-500">
                    {selected === photo.id ? "✓ Selected" : (photo.caption ?? "Photo")}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        <input
          name="question"
          placeholder="Anything specific to ask? (optional)"
          className={inputClassName}
        />
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-md bg-neutral-900 px-3 py-2 text-base font-medium text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900"
        >
          {busy ? "Looking…" : mode === "take" ? "Add photo & ask" : "Ask about this photo"}
        </button>
        {state ? (
          <p className={`text-sm ${state.ok ? "text-green-700 dark:text-green-500" : "text-red-600"}`}>
            {state.ok ? state.message : state.error}
          </p>
        ) : null}
      </form>
    </div>
  );
}

/** The licensed-professional notice, shown before any run (constitution §5, §7). */
function Disclaimer() {
  return (
    <p className="rounded-md bg-neutral-100 px-3 py-2 text-xs text-neutral-600 dark:bg-neutral-900 dark:text-neutral-400">
      {PHYSICAL_WORK_DISCLAIMER}
    </p>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200">
      {children}
    </p>
  );
}

function ModeButton({
  active,
  onClick,
  disabled,
  children,
}: {
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={`flex-1 rounded-md border px-3 py-2 text-sm font-medium disabled:opacity-50 ${
        active
          ? "border-neutral-900 bg-neutral-900 text-white dark:border-white dark:bg-white dark:text-neutral-900"
          : "border-neutral-300 text-neutral-700 dark:border-neutral-700 dark:text-neutral-300"
      }`}
    >
      {children}
    </button>
  );
}
