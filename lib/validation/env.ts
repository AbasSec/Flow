import { z } from "zod";

const optionalUrl = z
  .string()
  .trim()
  .refine((value) => value === "" || URL.canParse(value), {
    message: "Expected an empty value or a valid URL."
  });

export const browserEnvSchema = z.object({
  NEXT_PUBLIC_APP_URL: optionalUrl.default(""),
  NEXT_PUBLIC_SUPABASE_URL: optionalUrl.default(""),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().default("")
});

export const serverEnvSchema = browserEnvSchema.extend({
  SUPABASE_SECRET_KEY: z.string().default("")
});

export type BrowserEnv = z.infer<typeof browserEnvSchema>;
export type ServerEnv = z.infer<typeof serverEnvSchema>;
type EnvSource = Record<string, string | undefined>;

export function getBrowserEnv(source: EnvSource = process.env): BrowserEnv {
  return browserEnvSchema.parse(source);
}

export function getServerEnv(source: EnvSource = process.env): ServerEnv {
  return serverEnvSchema.parse(source);
}

export function hasSupabaseBrowserConfig(env: BrowserEnv): boolean {
  return Boolean(
    env.NEXT_PUBLIC_SUPABASE_URL && env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  );
}

export function hasSupabaseServerConfig(env: ServerEnv): boolean {
  return Boolean(
    env.NEXT_PUBLIC_SUPABASE_URL &&
      env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY &&
      env.SUPABASE_SECRET_KEY
  );
}
