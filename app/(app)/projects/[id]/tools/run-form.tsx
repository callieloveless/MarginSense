"use client";

import { useActionState, useRef } from "react";
import { runToolAction, type RunToolResult } from "./actions";

/**
 * Run the reference tool for a project (add-tool-platform). Phone-first; the run happens
 * server-side through the tenant-scoped action, which emits a suggestion + a conversation post
 * you'll see under Job context. Clears the note on a successful run.
 */
export function RunReferenceForm({ projectId }: { projectId: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState<RunToolResult | null, FormData>(
    async (_prev, formData) => {
      const result = await runToolAction(projectId, "reference", formData);
      if (result.ok) formRef.current?.reset();
      return result;
    },
    null,
  );

  return (
    <form ref={formRef} action={formAction} className="mt-3 space-y-2">
      <div className="flex gap-2">
        <input
          name="note"
          placeholder="A note to echo as a fact…"
          className="min-w-0 flex-1 rounded-md border border-neutral-300 px-3 py-2 text-base dark:border-neutral-700 dark:bg-neutral-900"
        />
        <button
          type="submit"
          disabled={pending}
          className="whitespace-nowrap rounded-md bg-neutral-900 px-3 py-2 text-base font-medium text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900"
        >
          {pending ? "Running…" : "Run"}
        </button>
      </div>
      {state ? (
        <p className={`text-sm ${state.ok ? "text-green-700 dark:text-green-500" : "text-red-600"}`}>
          {state.ok ? state.message : state.error}
        </p>
      ) : null}
    </form>
  );
}
