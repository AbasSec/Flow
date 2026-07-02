"use client";

import { createBrowserClient } from "@supabase/ssr";
import {
  getBrowserEnv,
  hasSupabaseBrowserConfig
} from "@/lib/validation/env";

export function createSupabaseBrowserClient() {
  const env = getBrowserEnv();

  if (!hasSupabaseBrowserConfig(env)) {
    return null;
  }

  return createBrowserClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  );
}
