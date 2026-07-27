"use client";

/**
 * The set's analysis state (revamp-photo-advisor). Auto-kicks Photo Advisor once when the set is
 * freshly posted (status `analyzing`) — automatic, but a separate call from the post, so a slow or
 * failed run never blocked getting the photos in. On failure it offers Retry. When done, it renders
 * nothing: the recommendations are revealed by the server-rendered queue below.
 */

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { analyzeSetAction } from "../actions";

export function SetAnalysis({
  projectId,
  setId,
  status,
}: {
  projectId: string;
  setId: string;
  status: "analyzing" | "done" | "failed";
}) {
  const router = useRouter();
  const [running, setRunning] = useState(status === "analyzing");
  const [aiOff, setAiOff] = useState(false);
  const kicked = useRef(false);

  async function run() {
    setRunning(true);
    const result = await analyzeSetAction(projectId, setId);
    setAiOff(Boolean(result.aiUnconfigured));
    setRunning(false);
    router.refresh();
  }

  useEffect(() => {
    if (status === "analyzing" && !kicked.current) {
      kicked.current = true;
      void run();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

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
        {aiOff ? (
          <p>AI isn&apos;t connected, so this set can&apos;t be analyzed yet. Your photos are saved.</p>
        ) : (
          <>
            <p>The analysis didn&apos;t finish. Your photos are saved — check your signal and try again.</p>
            <button type="button" onClick={run} className="mt-1 font-medium underline">
              Retry analysis
            </button>
          </>
        )}
      </div>
    );
  }

  return null; // done — the recommendations reveal below
}
