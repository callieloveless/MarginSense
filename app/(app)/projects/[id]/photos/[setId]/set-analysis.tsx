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

// De-dupe concurrent reads of the same set across remounts in this tab, so a set is never analyzed
// twice at once (which would double-spend the model call).
const inFlight = new Set<string>();

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
  const [slow, setSlow] = useState(false);
  const kicked = useRef(false);

  async function run() {
    if (inFlight.has(setId)) return;
    inFlight.add(setId);
    setSlow(false);
    setRunning(true);
    const slowTimer = setTimeout(() => setSlow(true), 45_000);
    try {
      await analyzeSetAction(projectId, setId);
    } catch (err) {
      // A rejected server action must never strand the spinner: fall through to refresh, which
      // re-reads the status the action now guarantees it resolves (done/failed, never analyzing).
      console.error("Set analysis request failed:", err);
    } finally {
      clearTimeout(slowTimer);
      inFlight.delete(setId);
      setRunning(false);
      router.refresh();
    }
  }

  useEffect(() => {
    // Auto-read a freshly posted set once — but never fire pointless runs with no model.
    if (aiConfigured && status === "analyzing" && !kicked.current && !inFlight.has(setId)) {
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
      <div
        aria-live="polite"
        className="rounded-xl border border-line bg-surface px-3 py-2 text-sm text-muted"
      >
        <p>
          MarginSense is looking at this set…{" "}
          <span className="opacity-80">this can take up to a minute.</span>
        </p>
        {slow ? (
          <button type="button" onClick={() => router.refresh()} className="mt-1 font-medium underline">
            Still working — check for the result
          </button>
        ) : null}
      </div>
    );
  }

  if (status === "failed") {
    return (
      <div className="rounded-xl border border-notice-line bg-notice-bg px-3 py-2 text-sm text-notice-fg">
        <p>The read didn&apos;t finish. Your photos are saved — try again.</p>
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
