"use client";

/**
 * The set's photos (revamp-photo-advisor): a hero plus a thumbnail strip. Thumbnails are the
 * short-lived signed URLs the server already issued; the **full-size** URL is signed on demand when
 * the user opens a photo (a URL signed at render would have expired), never substituted with the
 * thumbnail (constitution §7).
 */

import { useState } from "react";
import { signedPhotoUrlAction } from "../../context/photo-actions";

export interface SetPhoto {
  id: string;
  thumbUrl: string | null;
}

export function SetGallery({ photos }: { photos: SetPhoto[] }) {
  const [active, setActive] = useState(0);
  const [opening, setOpening] = useState(false);
  const current = photos[active];

  async function openFull() {
    if (!current) return;
    setOpening(true);
    const url = await signedPhotoUrlAction(current.id);
    setOpening(false);
    if (url) window.open(url, "_blank", "noopener");
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={openFull}
        aria-label="Open this photo full-size"
        className="block aspect-[4/3] w-full overflow-hidden rounded-2xl border border-line bg-line"
      >
        {current?.thumbUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={current.thumbUrl} alt="" className="h-full w-full object-cover" />
        ) : null}
      </button>

      {photos.length > 1 ? (
        <div className="flex gap-2 overflow-x-auto">
          {photos.map((p, i) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setActive(i)}
              aria-label={`Show photo ${i + 1}`}
              aria-current={i === active ? "true" : undefined}
              className={`h-16 w-16 shrink-0 overflow-hidden rounded-lg border-2 ${i === active ? "border-brand" : "border-line"}`}
            >
              {p.thumbUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.thumbUrl} alt="" className="h-full w-full object-cover" />
              ) : null}
            </button>
          ))}
        </div>
      ) : null}

      <p className="text-xs font-medium uppercase tracking-wide text-muted">
        Photo {active + 1} of {photos.length} in this set{opening ? " · opening…" : ""}
      </p>
    </div>
  );
}
