"use client";

import { useActionState, useRef } from "react";
import { PHYSICAL_WORK_DISCLAIMER } from "@/src/tools";
import { inputClassName } from "@/app/_components/fields";
import { runCodeFinderAction, type CodeFinderActionResult } from "./code-finder-actions";

/**
 * Code Finder's per-tool surface (add-code-finder) — a plain question, not a chat panel: ask about
 * local code, get sourced `code_ref` cards below with their compliance impact. The location is
 * pre-filled from the business service area and overridable. Code lookups also run automatically
 * off a Photo Advisor finding (the compose edge), so this is the *ask-it-yourself* path.
 *
 * The disclaimer sits above the input, before any run — code advice is non-authoritative and never
 * an official inspection (constitution §5, §7).
 */
export function CodeFinderForm({
  projectId,
  serviceArea,
  aiConfigured,
}: {
  projectId: string;
  serviceArea: string;
  aiConfigured: boolean;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState<CodeFinderActionResult | null, FormData>(
    async (_prev, formData) => {
      const query = String(formData.get("query") ?? "").trim();
      const location = String(formData.get("location") ?? "").trim();
      const result = await runCodeFinderAction(projectId, {
        query,
        ...(location !== "" ? { location } : {}),
      });
      if (result.ok) formRef.current?.reset();
      return result;
    },
    null,
  );

  return (
    <div className="mt-3 space-y-3">
      <p className="rounded-md bg-neutral-100 px-3 py-2 text-xs text-neutral-600 dark:bg-neutral-900 dark:text-neutral-400">
        {PHYSICAL_WORK_DISCLAIMER}
      </p>

      {aiConfigured ? (
        <form ref={formRef} action={action} className="space-y-2">
          <input
            name="query"
            placeholder="Ask about local code (e.g. deck ledger attachment)"
            className={inputClassName}
          />
          <input
            name="location"
            defaultValue={serviceArea}
            placeholder="Jurisdiction (city, county, state)"
            className={inputClassName}
          />
          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-md bg-neutral-900 px-3 py-2 text-base font-medium text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900"
          >
            {pending ? "Looking up…" : "Find the code"}
          </button>
          {state ? (
            <p className={`text-sm ${state.ok ? "text-green-700 dark:text-green-500" : "text-red-600"}`}>
              {state.ok ? state.message : state.error}
            </p>
          ) : null}
        </form>
      ) : (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200">
          Connect AI to look up local codes. Code lookups also run automatically when Photo Advisor
          flags something on a photo.
        </p>
      )}
    </div>
  );
}
