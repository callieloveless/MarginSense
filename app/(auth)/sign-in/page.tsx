"use client";

import { useActionState } from "react";
import { signInWithEmailAction, type ActionResult } from "../actions";

/**
 * Email one-time-code sign-in — this is also how new users sign up (the magic link creates
 * the account, then create-business + onboarding follow). Managed auth via Supabase
 * (constitution §7). Works as soon as Supabase env is configured; until then the action
 * returns a "not connected yet" message.
 */
export default function SignInPage() {
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(
    async (_prev, formData) => signInWithEmailAction(formData),
    null,
  );

  return (
    <form action={formAction} className="space-y-3">
      <label className="block text-sm font-medium" htmlFor="email">
        Sign in or create your account
      </label>
      <p className="text-sm text-neutral-500">
        Enter your email and we&apos;ll send you a secure sign-in link.
      </p>
      <input
        id="email"
        name="email"
        type="email"
        required
        placeholder="you@example.com"
        className="w-full rounded-md border border-neutral-300 px-3 py-2 text-base dark:border-neutral-700 dark:bg-neutral-900"
      />
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md bg-neutral-900 px-3 py-2 text-base font-medium text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900"
      >
        {pending ? "Sending…" : "Send sign-in link"}
      </button>
      {state ? (
        <p className={`text-sm ${state.ok ? "text-green-700" : "text-red-600"}`}>
          {state.ok ? state.message : state.error}
        </p>
      ) : null}
    </form>
  );
}
