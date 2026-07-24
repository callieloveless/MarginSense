"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getWritableServerClient } from "@/src/db/supabase";
import { getServerSession } from "@/src/db/session";
import { createBusinessSchema } from "@/src/db/validation";

export type ActionResult = { ok: true; message?: string } | { ok: false; error: string };

/**
 * This deployment's origin, from the request. Derived rather than configured so the same code
 * works on localhost, a preview URL, and production without a fourth environment variable to
 * keep in sync — the emailed link has to come back to the origin the user actually started from.
 */
async function requestOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

/**
 * Email sign-in (constitution §7 managed auth). Sends **both** a magic link and a 6-digit code in
 * the same email.
 *
 * The code is the reliable path: a clickable link is fragile because some mail providers (Proton,
 * many corporate scanners) **prefetch** the link, which consumes its one-time token before the
 * human clicks — the sign-in then fails with "email link is invalid or has expired." A code the
 * user types is immune to that and to the magic link's same-browser PKCE requirement. The link
 * still works when it isn't prefetched: `emailRedirectTo` points at `/auth/callback`, which
 * exchanges it for a session (the emailed link otherwise falls back to the project's Site URL).
 *
 * The code only appears in the email if the "Magic Link" template renders `{{ .Token }}` — see the
 * note in `relevant_notes.md`.
 */
export async function signInWithEmailAction(email: string): Promise<ActionResult> {
  const supabase = await getWritableServerClient();
  if (!supabase) return { ok: false, error: "Supabase isn't connected yet." };

  const trimmed = email.trim();
  if (!trimmed) return { ok: false, error: "Enter your email." };

  const { error } = await supabase.auth.signInWithOtp({
    email: trimmed,
    options: { emailRedirectTo: `${await requestOrigin()}/auth/callback` },
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, message: `Sent. Enter the 6-digit code from the email (or tap the link).` };
}

/**
 * Verify the 6-digit code from the sign-in email and start the session. This is the prefetch-proof
 * path (see {@link signInWithEmailAction}); it writes the session cookies (only possible in a
 * server action) and redirects into the app. `type: "email"` matches an OTP sent by
 * `signInWithOtp` for an email address.
 */
export async function verifyEmailCodeAction(email: string, code: string): Promise<ActionResult> {
  const supabase = await getWritableServerClient();
  if (!supabase) return { ok: false, error: "Supabase isn't connected yet." };

  const token = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(token)) return { ok: false, error: "Enter the 6-digit code from the email." };

  const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token, type: "email" });
  if (error) return { ok: false, error: error.message };
  redirect("/dashboard");
}

/** Whether the email-free developer sign-in is available. **Only outside production** — a real
 * deploy never exposes it, so the password path can't become a live sign-in mechanism. Not
 * exported: a `"use server"` module may only export async functions. The page checks the same
 * `NODE_ENV` condition directly. */
function devSignInEnabled(): boolean {
  return process.env.NODE_ENV !== "production";
}

/**
 * Email-free **developer** sign-in (local only) — for when Supabase's built-in SMTP is rate-limited
 * and you just need to get into the app. Signs in with a password, creating the account on first
 * use. It sends **no email at all**, so it needs Supabase's "Confirm email" turned OFF
 * (Authentication → Providers → Email) — otherwise the new account has no session until it's
 * confirmed by an email that would itself be rate-limited.
 *
 * Guarded by {@link devSignInEnabled}: a production build refuses it, so this convenience can never
 * be a way in on a real deploy.
 */
export async function devPasswordSignInAction(email: string, password: string): Promise<ActionResult> {
  if (!devSignInEnabled()) return { ok: false, error: "Developer sign-in is disabled here." };

  const supabase = await getWritableServerClient();
  if (!supabase) return { ok: false, error: "Supabase isn't connected yet." };

  const em = email.trim();
  if (!em || password.length < 6) {
    return { ok: false, error: "Enter an email and a password of at least 6 characters." };
  }

  // Existing account → straight in. New account → create it, which returns a session immediately
  // when email confirmation is off (the whole point of this path).
  const signIn = await supabase.auth.signInWithPassword({ email: em, password });
  if (!signIn.error) redirect("/dashboard");

  // An account created earlier while confirmation was ON is stuck "unconfirmed": flipping the
  // toggle only affects NEW signups, so this one has to be cleared first.
  if (/not confirmed/i.test(signIn.error.message)) {
    return {
      ok: false,
      error:
        "This email exists but was created before email confirmation was turned off. In Supabase → Authentication → Users, delete this user, then try Dev sign-in again.",
    };
  }

  const signUp = await supabase.auth.signUp({ email: em, password });
  if (signUp.error) return { ok: false, error: signUp.error.message };
  if (!signUp.data.session) {
    return {
      ok: false,
      error:
        "Account created, but email confirmation is ON — turn it OFF in Supabase (Authentication → Sign In / Providers → Email → Confirm email), then sign in again.",
    };
  }
  redirect("/dashboard");
}

/**
 * Create the business + user for a freshly signed-in identity — the only businesses/users
 * insert path (constitution §6.3). Runs the `create_business` SECURITY DEFINER function so
 * the very first insert is possible before the user has a business. The `business_id` is
 * never supplied by the client.
 */
export async function createBusinessAction(formData: FormData): Promise<ActionResult> {
  const session = await getServerSession();
  if (session.status === "unconfigured") {
    return { ok: false, error: "Supabase isn't connected yet." };
  }
  if (session.status === "signed-out") {
    return { ok: false, error: "Sign in first." };
  }
  if (session.status === "ready") {
    redirect("/dashboard");
  }

  const parsed = createBusinessSchema.safeParse({
    name: formData.get("name"),
    tradeType: formData.get("tradeType"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const supabase = await getWritableServerClient();
  if (!supabase) return { ok: false, error: "Supabase isn't connected yet." };

  const { error } = await supabase.rpc("create_business", {
    p_name: parsed.data.name,
    p_trade_type: parsed.data.tradeType,
  });
  if (error) return { ok: false, error: error.message };

  // New business → onboarding wizard to capture the §3.2 financial inputs (add-onboarding).
  redirect("/onboarding");
}
