import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { safeNextPath } from "@/lib/auth/next-path";

const PRIVATE_PREFIX = "/app";
const LOGIN_PATH = "/login";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (!pathname.startsWith(PRIVATE_PREFIX)) {
    return NextResponse.next();
  }

  // Build a mutable response so @supabase/ssr can write refreshed session cookies.
  let supabaseResponse = NextResponse.next({ request });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  // If Supabase is not configured, redirect to login rather than exposing any UI.
  if (!supabaseUrl || !supabaseKey) {
    const dest = new URL(LOGIN_PATH, request.url);
    dest.searchParams.set("next", safeNextPath(pathname, PRIVATE_PREFIX));
    return NextResponse.redirect(dest);
  }

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        // Write cookies to both the request (for the current handler) and to
        // supabaseResponse (so the browser receives the refreshed session).
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        );
      }
    }
  });

  // supabase.auth.getUser() makes a real network round-trip to validate the
  // JWT — this is intentionally more expensive than getSession() because it
  // guarantees the token has not been revoked server-side.
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    const dest = new URL(LOGIN_PATH, request.url);
    dest.searchParams.set("next", safeNextPath(pathname, PRIVATE_PREFIX));
    return NextResponse.redirect(dest);
  }

  return supabaseResponse;
}

export const config = {
  matcher: ["/app", "/app/:path*"]
};
