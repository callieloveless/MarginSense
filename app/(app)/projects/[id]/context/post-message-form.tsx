"use client";

import { useActionState, useRef } from "react";
import { postMessageAction, type ContextActionResult } from "./actions";

/**
 * Post into the project's single conversation (constitution §4.2). Phone-first; clears on a
 * successful post. The write runs server-side through the tenant-scoped action.
 */
export function PostMessageForm({ projectId }: { projectId: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState<ContextActionResult | null, FormData>(
    async (_prev, formData) => {
      const result = await postMessageAction(projectId, formData);
      if (result.ok) formRef.current?.reset();
      return result;
    },
    null,
  );

  return (
    <form ref={formRef} action={formAction} className="flex gap-2">
      <input
        name="body"
        placeholder="Add a note to this job…"
        className="min-w-0 flex-1 rounded-md border border-neutral-300 px-3 py-2 text-base dark:border-neutral-700 dark:bg-neutral-900"
      />
      <button
        type="submit"
        disabled={pending}
        className="whitespace-nowrap rounded-md bg-neutral-900 px-3 py-2 text-base font-medium text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900"
      >
        {pending ? "Posting…" : "Post"}
      </button>
      {state && !state.ok ? <p className="text-sm text-red-600">{state.error}</p> : null}
    </form>
  );
}
