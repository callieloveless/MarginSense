/**
 * Auth middleware (constitution §6.3, §7). Refreshes the Supabase session on each request
 * and keeps signed-out users out of the authenticated `(app)` shell. When Supabase env is
 * not configured yet, it passes through so the skeleton is walkable before infra lands.
 *
 * Gating by business (signed-in but no business → create-business) happens in the `(app)`
 * layout, which already resolves the tenant server-side; the middleware only enforces the
 * signed-in boundary and refreshes cookies.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

const PROTECTED_PREFIXES = ["/dashboard", "/projects", "/settings", "/onboarding"];

export async function middleware(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Not configured yet — let everything through (pre-infra skeleton).
  if (!url || !anonKey) return NextResponse.next();

  const response = NextResponse.next({ request });
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isProtected = PROTECTED_PREFIXES.some((p) => path.startsWith(p));
  if (isProtected && !user) {
    const signIn = request.nextUrl.clone();
    signIn.pathname = "/sign-in";
    signIn.searchParams.set("next", path);
    return NextResponse.redirect(signIn);
  }

  return response;
}

export const config = {
  // Run on app routes; skip static assets, Next internals, and the public routes that never need
  // a session — `share` (the client-facing document page) and `auth` (the sign-in callback). Those
  // would otherwise pay a wasted Supabase auth.getUser() round trip on every hit.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|share|auth|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
