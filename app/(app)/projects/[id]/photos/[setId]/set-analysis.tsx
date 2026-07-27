"use client";

/**
 * The set's analysis controls (revamp-photo-advisor). Photo Advisor runs on the whole set — and the
 * contractor is always in control of running it:
 *  - a freshly posted set (`analyzing`) is **auto-read once** (a separate call from the post, so a
 *    slow/failed read never blocked getting the photos in);
 *  - a failed read offers **Try again**;
 *  - a finished read offers **Re-read this set** (after adding photos, or to get a fresh look).
 * Without a configured model it says so plainly and offers no dead button. `aiConfigured` comes from
 * the server so the state is right on a fresh load, not only within one session.
 */

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { analyzeSetAction } from "../actions";

export function SetAnalysis({
  projectId,
  setId,
  status,
  aiConfigured,
}: {
  projectId: string;
  setId: string;
  status: "analyzing" | "done" | "failed";
  aiConfigured: boolean;
}) {
  const router = useRouter();
  const [running, setRunning] = useState(status === "analyzing" && aiConfigured);
  const kicked = useRef(false);

  async function run() {
    setRunning(true);
    await analyzeSetAction(projectId, setId);
    setRunning(false);
    router.refresh();
  }

  useEffect(() => {
    // Auto-read a freshly posted set once — but never fire pointless runs with no model.
    if (aiConfigured && status === "analyzing" && !kicked.current) {
      kicked.current = true;
      void run();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, aiConfigured]);

  if (!aiConfigured) {
    return (
      <div className="rounded-xl border border-notice-line bg-notice-bg px-3 py-2 text-sm text-notice-fg">
        AI isn&apos;t connected, so this set can&apos;t be read yet. Your photos are saved — connect AI
        in settings and reopen this set to read it.
      </div>
    );
  }

  if (running || status === "analyzing") {
    return (
      <p
        aria-live="polite"
        className="rounded-xl border border-line bg-surface px-3 py-2 text-sm text-muted"
      >
        MarginSense is looking at this set…
      </p>
    );
  }

  if (status === "failed") {
    return (
      <div className="rounded-xl border border-notice-line bg-notice-bg px-3 py-2 text-sm text-notice-fg">
        <p>The read didn&apos;t finish. Your photos are saved — check your signal and try again.</p>
        <button type="button" onClick={run} className="mt-1 font-medium underline">
          Try again
        </button>
      </div>
    );
  }

  // Done — the recommendations reveal below; offer an explicit re-read on demand.
  return (
    <button
      type="button"
      onClick={run}
      className="rounded-full border border-line px-3 py-1.5 text-sm font-medium text-muted"
    >
      ↻ Re-read this set
    </button>
  );
}
