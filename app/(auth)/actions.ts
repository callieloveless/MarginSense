"use server";

import { redirect } from "next/navigation";
import { getWritableServerClient } from "@/src/db/supabase";
import { getServerSession } from "@/src/db/session";
import { createBusinessSchema } from "@/src/db/validation";

export type ActionResult = { ok: true; message?: string } | { ok: false; error: string };

/** Email one-time-code sign-in (constitution §7 managed auth). Sends a login link/code. */
export async function signInWithEmailAction(formData: FormData): Promise<ActionResult> {
  const supabase = await getWritableServerClient();
  if (!supabase) return { ok: false, error: "Supabase isn't connected yet." };

  const email = String(formData.get("email") ?? "").trim();
  if (!email) return { ok: false, error: "Enter your email." };

  const { error } = await supabase.auth.signInWithOtp({ email });
  if (error) return { ok: false, error: error.message };
  return { ok: true, message: `Check ${email} for your sign-in link.` };
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

  redirect("/dashboard");
}
