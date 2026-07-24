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
