import "server-only";

import { createClient } from "@supabase/supabase-js";
import { getServerEnv, hasSupabaseServerConfig } from "@/lib/validation/env";

export function createSupabaseServerClient() {
  const env = getServerEnv();

  if (!hasSupabaseServerConfig(env)) {
    return null;
  }

  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
    auth: {
      persistSession: false
    }
  });
}
