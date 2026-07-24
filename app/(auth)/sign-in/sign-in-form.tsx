"use client";

import { useState } from "react";
import { inputClassName } from "@/app/_components/fields";
import {
  devPasswordSignInAction,
  signInWithEmailAction,
  verifyEmailCodeAction,
  type ActionResult,
} from "../actions";

/**
 * Email sign-in — this is also how new users sign up (the first sign-in creates the account, then
 * create-business + onboarding follow). Managed auth via Supabase (constitution §7).
 *
 * Two steps: send the email, then **enter the 6-digit code** from it. The code is the reliable
 * path — a clickable magic link is often prefetched by the mail provider (Proton, corporate
 * scanners), which burns its one-time token before the human clicks. The link still works when it
 * isn't prefetched (it lands on `/auth/callback`); `initialError` carries a failure from that
 * route so a dead link says why.
 */
export function SignInForm({
  initialError,
  devBypass = false,
}: {
  initialError?: string | undefined;
  /** Local dev only: show the email-free password sign-in (see `devPasswordSignInAction`). */
  devBypass?: boolean;
}) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState<ActionResult | null>(
    initialError ? { ok: false, error: initialError } : null,
  );

  async function onDevSignIn(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setState(null);
    const result = await devPasswordSignInAction(email, password);
    setState(result); // success redirects; a returned result means it failed
    setBusy(false);
  }

  async function onSend(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setState(null);
    const result = await signInWithEmailAction(email);
    setState(result);
    if (result.ok) setSent(true);
    setBusy(false);
  }

  async function onVerify(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setState(null);
    // On success this redirects; a returned result means it failed.
    const result = await verifyEmailCodeAction(email, code);
    setState(result);
    setBusy(false);
  }

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-medium">Sign in or create your account</p>
        <p className="text-sm text-neutral-500">
          {sent
            ? `Enter the 6-digit code we sent to ${email}.`
            : "Enter your email and we'll send you a 6-digit code."}
        </p>
      </div>

      {!sent ? (
        <form onSubmit={onSend} className="space-y-3">
          <label className="sr-only" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className={inputClassName}
          />
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-md bg-neutral-900 px-3 py-2 text-base font-medium text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900"
          >
            {busy ? "Sending…" : "Send code"}
          </button>
        </form>
      ) : (
        <form onSubmit={onVerify} className="space-y-3">
          <label className="sr-only" htmlFor="code">
            6-digit code
          </label>
          <input
            id="code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            required
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="123456"
            className={`${inputClassName} tracking-[0.4em]`}
          />
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-md bg-neutral-900 px-3 py-2 text-base font-medium text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900"
          >
            {busy ? "Verifying…" : "Verify & sign in"}
          </button>
          <button
            type="button"
            onClick={() => {
              setSent(false);
              setCode("");
              setState(null);
            }}
            className="w-full text-sm text-neutral-500 underline"
          >
            Use a different email
          </button>
        </form>
      )}

      {state ? (
        <p className={`text-sm ${state.ok ? "text-green-700 dark:text-green-500" : "text-red-600"}`}>
          {state.ok ? state.message : state.error}
        </p>
      ) : null}

      {devBypass ? (
        <div className="mt-4 space-y-2 border-t border-dashed border-neutral-300 pt-4 dark:border-neutral-700">
          <p className="text-xs font-medium text-neutral-500">
            Developer sign-in (local only — no email)
          </p>
          <form onSubmit={onDevSignIn} className="space-y-2">
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className={inputClassName}
            />
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="password (6+ chars, created on first use)"
              className={inputClassName}
            />
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-md border border-neutral-400 px-3 py-2 text-sm font-medium disabled:opacity-50 dark:border-neutral-600"
            >
              {busy ? "Signing in…" : "Dev sign-in"}
            </button>
          </form>
          <p className="text-xs text-neutral-400">
            Needs Supabase &ldquo;Confirm email&rdquo; turned off. Never shown in production.
          </p>
        </div>
      ) : null}
    </div>
  );
}
