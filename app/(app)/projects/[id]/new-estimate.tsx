"use client";

import { useActionState } from "react";
import { createEstimateAction, type EstimateActionResult } from "./estimates/actions";

/**
 * Create a new estimate version for this project (constitution §3.4). On success the action
 * redirects to the new estimate; margin/contingency default from the business settings.
 */
export function NewEstimateForm({ projectId, disabled }: { projectId: string; disabled: boolean }) {
  const [state, formAction, pending] = useActionState<EstimateActionResult | null, FormData>(
    async (_prev, formData) => createEstimateAction(projectId, formData),
    null,
  );

  return (
    <form action={formAction} className="flex gap-2">
      <input
        name="versionLabel"
        disabled={disabled}
        placeholder="Version name (e.g. v1, Option A)"
        className="min-w-0 flex-1 rounded-md border border-neutral-300 px-3 py-2 text-base disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-900"
      />
      <button
        type="submit"
        disabled={disabled || pending}
        className="whitespace-nowrap rounded-md bg-neutral-900 px-3 py-2 text-base font-medium text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900"
      >
        {pending ? "Adding…" : "New estimate"}
      </button>
      {state && !state.ok ? <p className="text-sm text-red-600">{state.error}</p> : null}
    </form>
  );
}
