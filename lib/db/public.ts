import { createClient } from "@supabase/supabase-js";
import {
  getBrowserEnv,
  hasSupabaseBrowserConfig
} from "@/lib/validation/env";

export function createSupabasePublicClient() {
  const env = getBrowserEnv();

  if (!hasSupabaseBrowserConfig(env)) {
    return null;
  }

  return createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    }
  );
}
