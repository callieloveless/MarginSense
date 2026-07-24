import { SignInForm } from "./sign-in-form";

/** The email-free developer sign-in is available outside production only (mirrors the guard in
 * `devPasswordSignInAction`); a real deploy never renders it. */
const DEV_BYPASS = process.env.NODE_ENV !== "production";

/**
 * The sign-in screen. A server component so it can read the `error` `/auth/callback` sends back
 * when a link is expired or already used, and whether the email-free developer sign-in is
 * available (local dev only), handing both to the form.
 */
export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string | string[] }>;
}) {
  const { error } = await searchParams;
  const message = Array.isArray(error) ? error[0] : error;
  return <SignInForm initialError={message} devBypass={DEV_BYPASS} />;
}
