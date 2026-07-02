import { describe, expect, it } from "vitest";
import {
  getBrowserEnv,
  hasSupabaseBrowserConfig
} from "../../lib/validation/env";

describe("Milestone 1 test harness", () => {
  it("accepts empty Supabase placeholders without enabling a client", () => {
    const env = getBrowserEnv({
      NEXT_PUBLIC_APP_URL: "",
      NEXT_PUBLIC_SUPABASE_URL: "",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: ""
    });

    expect(hasSupabaseBrowserConfig(env)).toBe(false);
  });
});
