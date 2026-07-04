import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { safeNextPath } from "@/lib/auth/next-path";

// Next.js 16 uses proxy.ts (renamed from middleware.ts)
const middlewareSrc = readFileSync(join(process.cwd(), "proxy.ts"), "utf8");

const loginActionSrc = readFileSync(
  join(process.cwd(), "app", "login", "actions.ts"),
  "utf8"
);

const loginPageSrc = readFileSync(
  join(process.cwd(), "app", "login", "page.tsx"),
  "utf8"
);

const appPageSrc = readFileSync(
  join(process.cwd(), "app", "app", "page.tsx"),
  "utf8"
);

const orderDetailPageSrc = readFileSync(
  join(process.cwd(), "app", "app", "orders", "[id]", "page.tsx"),
  "utf8"
);

const kitchenPageSrc = readFileSync(
  join(process.cwd(), "app", "app", "kitchen", "page.tsx"),
  "utf8"
);

const dashboardServiceSrc = readFileSync(
  join(process.cwd(), "lib", "services", "dashboard.ts"),
  "utf8"
);

const kitchenServiceSrc = readFileSync(
  join(process.cwd(), "lib", "services", "kitchen.ts"),
  "utf8"
);

const contextServiceSrc = readFileSync(
  join(process.cwd(), "lib", "services", "context.ts"),
  "utf8"
);

describe("safeNextPath", () => {
  it("accepts valid internal paths", () => {
    expect(safeNextPath("/app", "/app")).toBe("/app");
    expect(safeNextPath("/app/kitchen", "/app")).toBe("/app/kitchen");
    expect(safeNextPath("/app/orders/some-uuid", "/app")).toBe("/app/orders/some-uuid");
    expect(safeNextPath("/app?foo=bar", "/app")).toBe("/app?foo=bar");
  });

  it("rejects null and empty values", () => {
    expect(safeNextPath(null, "/app")).toBe("/app");
    expect(safeNextPath("", "/app")).toBe("/app");
    expect(safeNextPath(undefined, "/app")).toBe("/app");
  });

  it("rejects protocol-relative paths", () => {
    expect(safeNextPath("//evil.com", "/app")).toBe("/app");
    expect(safeNextPath("//evil.com/steal", "/app")).toBe("/app");
  });

  it("rejects paths that do not start with /", () => {
    expect(safeNextPath("http://evil.com", "/app")).toBe("/app");
    expect(safeNextPath("https://evil.com", "/app")).toBe("/app");
    expect(safeNextPath("evil.com", "/app")).toBe("/app");
    expect(safeNextPath("javascript:alert(1)", "/app")).toBe("/app");
  });

  it("rejects login-loop paths", () => {
    expect(safeNextPath("/login", "/app")).toBe("/app");
    expect(safeNextPath("/login?error=x", "/app")).toBe("/app");
    expect(safeNextPath("/LOGIN", "/app")).toBe("/app");
  });

  it("rejects paths longer than 512 characters", () => {
    const longPath = "/" + "a".repeat(513);
    expect(safeNextPath(longPath, "/app")).toBe("/app");
  });

  it("accepts paths with @ characters in path segments (not an attack vector)", () => {
    // '@' in a URL path is a normal character — only special in the authority component
    expect(safeNextPath("/app@evil.com", "/app")).toBe("/app@evil.com");
  });
});

describe("middleware route protection", () => {
  it("exists at the project root with a correct /app matcher", () => {
    expect(middlewareSrc).toContain('"/app"');
    expect(middlewareSrc).toContain('"/app/:path*"');
    expect(middlewareSrc).toBeTruthy();
  });

  it("exports a proxy function (Next.js 16 convention)", () => {
    expect(middlewareSrc).toContain("export async function proxy(");
  });

  it("uses supabase.auth.getUser() for real JWT validation (not getSession)", () => {
    expect(middlewareSrc).toContain("supabase.auth.getUser()");
    expect(middlewareSrc).not.toContain("supabase.auth.getSession()");
  });

  it("redirects unauthenticated requests to /login with a safe next param", () => {
    expect(middlewareSrc).toContain('"/login"');
    expect(middlewareSrc).toContain("safeNextPath");
    expect(middlewareSrc).toContain("NextResponse.redirect");
  });

  it("imports safeNextPath from the shared utility module", () => {
    expect(middlewareSrc).toContain('from "@/lib/auth/next-path"');
  });

  it("uses createServerClient from @supabase/ssr (not server-only helpers)", () => {
    expect(middlewareSrc).toContain('from "@supabase/ssr"');
    expect(middlewareSrc).not.toContain('from "@/lib/db/server"');
  });
});

describe("/app route auth guard coverage", () => {
  it("dashboard page calls getDashboardData which requires workspace context", () => {
    expect(appPageSrc).toContain("getDashboardData");
    expect(dashboardServiceSrc).toContain("requireWorkspaceContext");
  });

  it("orders detail page calls requireWorkspaceContext directly", () => {
    expect(orderDetailPageSrc).toContain("requireWorkspaceContext");
  });

  it("kitchen page calls getKitchenBoard which requires workspace context", () => {
    expect(kitchenPageSrc).toContain("getKitchenBoard");
    expect(kitchenServiceSrc).toContain("requireWorkspaceContext");
  });

  it("requireWorkspaceContext redirects to /login when unauthenticated", () => {
    expect(contextServiceSrc).toContain('redirect("/login"');
  });

  it("requireWorkspaceContext uses getUser() via getAuthenticatedUser", () => {
    expect(contextServiceSrc).toContain("getAuthenticatedUser");
    // getAuthenticatedUser in lib/auth/session.ts calls supabase.auth.getUser()
  });
});

describe("login next-redirect flow", () => {
  it("login page renders a hidden next input from validated searchParams", () => {
    expect(loginPageSrc).toContain('name="next"');
    expect(loginPageSrc).toContain("safeNextPath");
    expect(loginPageSrc).toContain('type="hidden"');
  });

  it("login page imports safeNextPath for server-side validation", () => {
    expect(loginPageSrc).toContain('from "@/lib/auth/next-path"');
  });

  it("signInAction reads next from formData and validates before redirect", () => {
    expect(loginActionSrc).toContain("safeNextPath");
    expect(loginActionSrc).toContain('formData.get("next"');
    expect(loginActionSrc).toContain("redirect(nextPath)");
  });

  it("signInAction preserves next param through error redirects", () => {
    expect(loginActionSrc).toContain("redirectWithError");
    expect(loginActionSrc).toContain("nextPath");
  });
});
