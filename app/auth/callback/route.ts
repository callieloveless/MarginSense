import { NextResponse, type NextRequest } from "next/server";
import { getWritableServerClient } from "@/src/db/supabase";

/**
 * The magic-link landing point (constitution §7 — managed auth).
 *
 * `@supabase/ssr` uses the **PKCE flow**: `signInWithOtp` stores a code verifier in a cookie and
 * the emailed link returns here with `?code=…`. That code is worthless until it is exchanged for
 * a session, and **only a Route Handler can write the session cookies** — a server component
 * can't, and the middleware only refreshes an existing session. Without this route the link
 * bounces straight back to `/sign-in`, which is exactly what it did before this file existed.
 *
 * On success the user lands wherever they were headed (`?next=`), defaulting to the dashboard;
 * the `(app)` layout then decides whether that means the dashboard or create-business.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  // Only same-origin paths: a `next` of "https://evil.example" must never become a redirect.
  const requested = url.searchParams.get("next") ?? "/dashboard";
  const next = requested.startsWith("/") && !requested.startsWith("//") ? requested : "/dashboard";

  const failed = (reason: string): NextResponse => {
    const signIn = new URL("/sign-in", url.origin);
    signIn.searchParams.set("error", reason);
    return NextResponse.redirect(signIn);
  };

  // Supabase reports a rejected link (expired, already used) as an error on the query string.
  const errorDescription = url.searchParams.get("error_description");
  if (errorDescription) return failed(errorDescription);
  if (!code) return failed("That sign-in link is missing its code. Request a new one.");

  const supabase = await getWritableServerClient();
  if (!supabase) return failed("Supabase isn't connected yet.");

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return failed(error.message);

  return NextResponse.redirect(new URL(next, url.origin));
}
