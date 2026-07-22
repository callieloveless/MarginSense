import { redirect } from "next/navigation";

/** The root routes into the authenticated shell; the middleware + (app) layout decide
 * whether that means sign-in, create-business, or the dashboard. */
export default function Home() {
  redirect("/dashboard");
}
