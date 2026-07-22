"use client";

import { useActionState } from "react";
import { createProjectAction, type CreateProjectResult } from "./actions";

/**
 * Phone-first create-project form (constitution §1). Client component only because it
 * shows inline validation feedback; the write itself runs server-side through the
 * tenant-scoped action.
 */
export function NewProjectForm({ disabled }: { disabled: boolean }) {
  const [state, formAction, pending] = useActionState<CreateProjectResult | null, FormData>(
    async (_prev, formData) => createProjectAction(formData),
    null,
  );

  return (
    <form action={formAction} className="space-y-2">
      <input
        name="clientName"
        required
        disabled={disabled}
        placeholder="Client name"
        className="w-full rounded-md border border-neutral-300 px-3 py-2 text-base disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-900"
      />
      <input
        name="address"
        disabled={disabled}
        placeholder="Job address (optional)"
        className="w-full rounded-md border border-neutral-300 px-3 py-2 text-base disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-900"
      />
      <textarea
        name="scope"
        disabled={disabled}
        placeholder="Scope note (optional)"
        rows={2}
        className="w-full rounded-md border border-neutral-300 px-3 py-2 text-base disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-900"
      />
      <button
        type="submit"
        disabled={disabled || pending}
        className="w-full rounded-md bg-neutral-900 px-3 py-2 text-base font-medium text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900"
      >
        {pending ? "Adding…" : "Add project"}
      </button>
      {state && !state.ok ? (
        <p className="text-sm text-red-600">{state.error}</p>
      ) : null}
    </form>
  );
}
