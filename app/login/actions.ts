"use server";

import { redirect } from "next/navigation";
import { safeNextPath } from "@/lib/auth/next-path";
import { createSupabaseServerClient } from "@/lib/db/server";

function redirectWithError(message: string, nextPath: string): never {
  const params = new URLSearchParams({ error: message });
  if (nextPath && nextPath !== "/app") params.set("next", nextPath);
  redirect(`/login?${params.toString()}`);
}

export async function signInAction(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const nextPath = safeNextPath(String(formData.get("next") ?? ""), "/app");

  if (!email || !password) {
    redirectWithError("Email and password are required.", nextPath);
  }

  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    redirectWithError("Supabase is not configured for this environment.", nextPath);
  }

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password
  });

  if (error) {
    redirectWithError("Sign-in failed.", nextPath);
  }

  redirect(nextPath);
}
