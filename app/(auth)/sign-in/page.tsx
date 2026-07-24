import { SignInForm } from "./sign-in-form";

/**
 * The sign-in screen. A server component so it can read the `error` `/auth/callback` sends back
 * when a link is expired or already used, and hand it to the form as its initial state.
 */
export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string | string[] }>;
}) {
  const { error } = await searchParams;
  const message = Array.isArray(error) ? error[0] : error;
  return <SignInForm initialError={message} />;
}
