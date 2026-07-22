"use client";

import { useActionState } from "react";
import { createBusinessAction, type ActionResult } from "../actions";

/**
 * Minimal create-business step — the only path that creates a business (constitution §6.3).
 * A placeholder the onboarding wizard (`add-onboarding`) will absorb; it captures just the
 * name and trade type so a tenant exists before the financial inputs are gathered.
 */
export default function CreateBusinessPage() {
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(
    async (_prev, formData) => createBusinessAction(formData),
    null,
  );

  return (
    <form action={formAction} className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold">Set up your business</h2>
        <p className="mt-1 text-sm text-neutral-500">
          Just the basics for now — your overhead, wage, and goals come next.
        </p>
      </div>
      <input
        name="name"
        required
        placeholder="Business name"
        className="w-full rounded-md border border-neutral-300 px-3 py-2 text-base dark:border-neutral-700 dark:bg-neutral-900"
      />
      <input
        name="tradeType"
        required
        placeholder="Trade (e.g. general contractor)"
        className="w-full rounded-md border border-neutral-300 px-3 py-2 text-base dark:border-neutral-700 dark:bg-neutral-900"
      />
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md bg-neutral-900 px-3 py-2 text-base font-medium text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900"
      >
        {pending ? "Creating…" : "Create business"}
      </button>
      {state && !state.ok ? <p className="text-sm text-red-600">{state.error}</p> : null}
    </form>
  );
}
