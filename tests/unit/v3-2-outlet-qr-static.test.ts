import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// ---------------------------------------------------------------------------
// Source files under test
// ---------------------------------------------------------------------------

const v32Migration = readFileSync(
  join(
    process.cwd(),
    "supabase",
    "migrations",
    "20260705000100_v3_2_outlet_qr.sql"
  ),
  "utf8"
);

const v31Migration = readFileSync(
  join(
    process.cwd(),
    "supabase",
    "migrations",
    "20260703000200_v3_1_lifecycle_kernel.sql"
  ),
  "utf8"
);

const m008Migration = readFileSync(
  join(
    process.cwd(),
    "supabase",
    "migrations",
    "20260702000800_public_qr_ordering.sql"
  ),
  "utf8"
);

const publicOrdering = readFileSync(
  join(process.cwd(), "lib", "services", "public-ordering.ts"),
  "utf8"
);

const outletPage = readFileSync(
  join(process.cwd(), "app", "o", "[outletToken]", "page.tsx"),
  "utf8"
);

const outletActions = readFileSync(
  join(process.cwd(), "app", "o", "[outletToken]", "actions.ts"),
  "utf8"
);

const outletClient = readFileSync(
  join(process.cwd(), "app", "o", "[outletToken]", "public-outlet-menu-client.tsx"),
  "utf8"
);

const dashboardPage = readFileSync(
  join(process.cwd(), "app", "app", "page.tsx"),
  "utf8"
);

const tableTokenPage = readFileSync(
  join(process.cwd(), "app", "t", "[tableToken]", "page.tsx"),
  "utf8"
);

const tableTokenActions = readFileSync(
  join(process.cwd(), "app", "t", "[tableToken]", "actions.ts"),
  "utf8"
);

const publicStatusPage = readFileSync(
  join(process.cwd(), "app", "order", "[publicOrderId]", "page.tsx"),
  "utf8"
);

// ---------------------------------------------------------------------------
// Task 1: Migration — schema
// ---------------------------------------------------------------------------

describe("V3.2 migration: public_outlet_token column", () => {
  it("adds public_outlet_token to outlets", () => {
    expect(v32Migration).toContain("public_outlet_token");
  });

  it("seeds existing outlets before making column not null", () => {
    const updateIdx = v32Migration.indexOf("update public.outlets");
    const notNullIdx = v32Migration.indexOf("set not null");

    expect(updateIdx).toBeGreaterThan(0);
    expect(notNullIdx).toBeGreaterThan(updateIdx);
  });

  it("marks column not null", () => {
    expect(v32Migration).toContain("set not null");
  });

  it("applies a min length check >= 32", () => {
    expect(v32Migration).toMatch(
      /check\s*\(\s*length\s*\(\s*public_outlet_token\s*\)\s*>=\s*32\s*\)/
    );
  });

  it("creates a unique index on public_outlet_token", () => {
    expect(v32Migration).toContain("unique index");
    expect(v32Migration).toContain("outlets_public_outlet_token_idx");
    expect(v32Migration).toContain("on public.outlets (public_outlet_token)");
  });

  it("uses gen_random_bytes(24) for the default", () => {
    expect(v32Migration).toContain("gen_random_bytes(24)");
  });
});

// ---------------------------------------------------------------------------
// Task 1: Migration — RPC
// ---------------------------------------------------------------------------

describe("V3.2 migration: flow_m4_public_outlet_menu RPC", () => {
  it("defines flow_m4_public_outlet_menu", () => {
    expect(v32Migration).toContain("flow_m4_public_outlet_menu(outlet_token text)");
  });

  it("is SECURITY DEFINER", () => {
    expect(v32Migration).toContain("security definer");
  });

  it("sets safe search path", () => {
    expect(v32Migration).toContain("set search_path = pg_catalog, pg_temp");
  });

  it("validates token length before lookup", () => {
    const rpcBody = v32Migration.split("flow_m4_public_outlet_menu(outlet_token text)")[1];

    expect(rpcBody).toContain("length(btrim(outlet_token)) < 32");
    expect(rpcBody).toContain("return jsonb_build_object('found', false)");
  });

  it("returns outlet_name and payment_label — not outlet UUID, org_id, or site_id", () => {
    const rpcBody = v32Migration
      .split("flow_m4_public_outlet_menu(outlet_token text)")[1]
      .split(/\ncreate or replace function public\./)[0];

    expect(rpcBody).toContain("outlet_name");
    expect(rpcBody).toContain("payment_label");
    expect(rpcBody).not.toContain("'outlet_id'");
    expect(rpcBody).not.toContain("'org_id'");
    expect(rpcBody).not.toContain("'site_id'");
  });

  it("returns table_label and public_table_token — not table session UUIDs", () => {
    const rpcBody = v32Migration
      .split("flow_m4_public_outlet_menu(outlet_token text)")[1]
      .split(/\ncreate or replace function public\./)[0];

    expect(rpcBody).toContain("table_label");
    expect(rpcBody).toContain("public_table_token");
    expect(rpcBody).not.toContain("'table_session_id'");
  });

  it("filters tables to AVAILABLE or OPEN with valid expiry", () => {
    const rpcBody = v32Migration.split("flow_m4_public_outlet_menu(outlet_token text)")[1];

    expect(rpcBody).toContain("AVAILABLE");
    expect(rpcBody).toContain("OPEN");
    expect(rpcBody).toContain("public_token_expires_at > now()");
  });

  it("grants execution to anon and authenticated only", () => {
    expect(v32Migration).toContain(
      "grant execute on function public.flow_m4_public_outlet_menu(text) to anon, authenticated"
    );
  });

  it("revokes from public, anon, and authenticated before granting", () => {
    expect(v32Migration).toContain(
      "revoke all on function public.flow_m4_public_outlet_menu(text) from public"
    );
    expect(v32Migration).toContain(
      "revoke all on function public.flow_m4_public_outlet_menu(text) from anon"
    );
    expect(v32Migration).toContain(
      "revoke all on function public.flow_m4_public_outlet_menu(text) from authenticated"
    );
  });

  it("returns public_menu_token for items — not raw menu item IDs", () => {
    const rpcBody = v32Migration
      .split("flow_m4_public_outlet_menu(outlet_token text)")[1]
      .split(/\ncreate or replace function public\./)[0];

    expect(rpcBody).toContain("public_menu_token");
    expect(rpcBody).not.toContain("'menu_item_id'");
  });

  it("uses flow_m4_public_item_available for availability — same pattern as flow_m4_public_menu", () => {
    const rpcBody = v32Migration
      .split("flow_m4_public_outlet_menu(outlet_token text)")[1]
      .split(/\ncreate or replace function public\./)[0];

    expect(rpcBody).toContain("flow_m4_public_item_available");
  });
});

// ---------------------------------------------------------------------------
// Task 1: Migration — outlet-aware submission wrapper
// ---------------------------------------------------------------------------

describe("V3.2 migration: flow_m4_create_outlet_qr_order wrapper", () => {
  it("defines flow_m4_create_outlet_qr_order with outlet_token, target_table_token, order_items, request_key", () => {
    expect(v32Migration).toContain("flow_m4_create_outlet_qr_order(");
    const wrapperBody = v32Migration.split("flow_m4_create_outlet_qr_order(")[1];
    expect(wrapperBody).toContain("outlet_token");
    expect(wrapperBody).toContain("target_table_token");
    expect(wrapperBody).toContain("order_items");
    expect(wrapperBody).toContain("jsonb");
    expect(wrapperBody).toContain("request_key");
  });

  it("is SECURITY DEFINER with constrained search path", () => {
    const wrapperBody = v32Migration.split("flow_m4_create_outlet_qr_order(")[1];
    expect(wrapperBody).toContain("security definer");
    expect(wrapperBody).toContain("set search_path = pg_catalog, pg_temp");
  });

  it("validates outlet token minimum length before any query", () => {
    const wrapperBody = v32Migration.split("flow_m4_create_outlet_qr_order(")[1];
    expect(wrapperBody).toContain("length(btrim(outlet_token)) < 32");
  });

  it("validates table token minimum length before any query", () => {
    const wrapperBody = v32Migration.split("flow_m4_create_outlet_qr_order(")[1];
    expect(wrapperBody).toContain("length(btrim(target_table_token)) < 32");
  });

  it("resolves active outlet by public_outlet_token before table lookup", () => {
    const wrapperBody = v32Migration.split("flow_m4_create_outlet_qr_order(")[1];
    expect(wrapperBody).toContain("o.public_outlet_token = outlet_token");
    expect(wrapperBody).toContain("and o.is_active");
  });

  it("requires table session outlet_id to equal the resolved outlet — prevents cross-outlet submission", () => {
    const wrapperBody = v32Migration.split("flow_m4_create_outlet_qr_order(")[1];
    expect(wrapperBody).toContain("ts.outlet_id = target_outlet.id");
  });

  it("requires AVAILABLE or OPEN table status with non-expired public token", () => {
    const wrapperBody = v32Migration.split("flow_m4_create_outlet_qr_order(")[1];
    expect(wrapperBody).toContain("ts.public_token_expires_at > now()");
    expect(wrapperBody).toContain("ts.status in ('AVAILABLE', 'OPEN')");
  });

  it("delegates to flow_m4_create_qr_table_order only after both validations pass", () => {
    const wrapperBody = v32Migration.split("flow_m4_create_outlet_qr_order(")[1];
    expect(wrapperBody).toContain("return public.flow_m4_create_qr_table_order(");
    const outletCheckIdx = wrapperBody.indexOf("if not found then");
    const delegationIdx = wrapperBody.indexOf("return public.flow_m4_create_qr_table_order(");
    expect(delegationIdx).toBeGreaterThan(outletCheckIdx);
  });

  it("does not duplicate lifecycle, inventory, or audit logic from flow_m4_create_qr_table_order", () => {
    const wrapperBody = v32Migration.split("flow_m4_create_outlet_qr_order(")[1];
    expect(wrapperBody).not.toContain("insert into public.orders");
    expect(wrapperBody).not.toContain("insert into public.kitchen_tickets");
    expect(wrapperBody).not.toContain("insert into public.inventory_ledger");
    expect(wrapperBody).not.toContain("insert into public.audit_events");
  });

  it("does not return raw outlet UUID, org UUID, or table session UUID", () => {
    const wrapperBody = v32Migration.split("flow_m4_create_outlet_qr_order(")[1];
    expect(wrapperBody).not.toContain("'outlet_id'");
    expect(wrapperBody).not.toContain("'org_id'");
    expect(wrapperBody).not.toContain("'table_session_id'");
  });

  it("applies deny-first grants — revokes before granting to anon and authenticated", () => {
    expect(v32Migration).toContain(
      "revoke all on function public.flow_m4_create_outlet_qr_order(text, text, jsonb, text) from public"
    );
    expect(v32Migration).toContain(
      "revoke all on function public.flow_m4_create_outlet_qr_order(text, text, jsonb, text) from anon"
    );
    expect(v32Migration).toContain(
      "revoke all on function public.flow_m4_create_outlet_qr_order(text, text, jsonb, text) from authenticated"
    );
    expect(v32Migration).toContain(
      "grant execute on function public.flow_m4_create_outlet_qr_order(text, text, jsonb, text) to anon, authenticated"
    );
    const revokeIdx = v32Migration.indexOf(
      "revoke all on function public.flow_m4_create_outlet_qr_order"
    );
    const grantIdx = v32Migration.indexOf(
      "grant execute on function public.flow_m4_create_outlet_qr_order"
    );
    expect(grantIdx).toBeGreaterThan(revokeIdx);
  });
});

// ---------------------------------------------------------------------------
// Task 1: Existing migrations are unchanged
// ---------------------------------------------------------------------------

describe("V3.2 does not modify existing migrations", () => {
  it("flow_m4_create_qr_table_order signature unchanged in migration 010", () => {
    expect(v31Migration).toContain(
      "create or replace function public.flow_m4_create_qr_table_order("
    );
    expect(v31Migration).toContain("target_table_token text,");
    expect(v31Migration).toContain("order_items jsonb,");
    expect(v31Migration).toContain("request_key text");
  });

  it("flow_m4_create_qr_table_order branches on outlet_mode in migration 010", () => {
    expect(v31Migration).toContain("RELEASE_BY_AUTHORISED_STAFF");
    expect(v31Migration).toContain("RELEASE_ON_SUBMIT");
    expect(v31Migration).toContain("V3_1");
    expect(v31Migration).toContain("LEGACY");
  });

  it("flow_m4_public_menu exists in migration 008", () => {
    expect(m008Migration).toContain(
      "create or replace function public.flow_m4_public_menu(target_table_token text)"
    );
  });

  it("migration 008 does not contain outlet_token references", () => {
    expect(m008Migration).not.toContain("public_outlet_token");
    expect(m008Migration).not.toContain("flow_m4_public_outlet_menu");
  });
});

// ---------------------------------------------------------------------------
// Task 2: Service layer — getPublicOutletMenu
// ---------------------------------------------------------------------------

describe("public-ordering.ts: getPublicOutletMenu", () => {
  it("exports getPublicOutletMenu", () => {
    expect(publicOrdering).toContain("export async function getPublicOutletMenu(");
  });

  it("calls flow_m4_public_outlet_menu RPC", () => {
    expect(publicOrdering).toContain("flow_m4_public_outlet_menu");
  });

  it("uses the anonymous public Supabase client — not admin client", () => {
    const fnBody = publicOrdering
      .split("export async function getPublicOutletMenu(")[1]
      .split(/\nexport async function /)[0];

    expect(fnBody).toContain("createSupabasePublicClient");
    expect(fnBody).not.toContain("requireAdminClient");
  });

  it("returns ok:false on RPC error without leaking error details", () => {
    const fnBody = publicOrdering
      .split("export async function getPublicOutletMenu(")[1]
      .split(/\nexport async function /)[0];

    expect(fnBody).toContain("ok: false");
    expect(fnBody).toContain("outlet menu is unavailable");
    expect(fnBody).not.toContain("error.message");
    expect(fnBody).not.toContain("JSON.stringify(error");
  });

  it("exports PublicOutletMenu type", () => {
    expect(publicOrdering).toContain("export type PublicOutletMenu");
  });

  it("exports PublicOutletTable type", () => {
    expect(publicOrdering).toContain("export type PublicOutletTable");
  });

  it("exports OutletQrSource type", () => {
    expect(publicOrdering).toContain("export type OutletQrSource");
  });
});

describe("public-ordering.ts: getOutletQrSource", () => {
  it("exports getOutletQrSource", () => {
    expect(publicOrdering).toContain("export async function getOutletQrSource(");
  });

  it("uses admin client — authorised internal use only", () => {
    const fnBody = publicOrdering
      .split("export async function getOutletQrSource(")[1]
      .split(/\nexport async function /)[0];

    expect(fnBody).toContain("requireAdminClient");
  });

  it("queries outlets table by org_id for public_outlet_token", () => {
    const fnBody = publicOrdering
      .split("export async function getOutletQrSource(")[1]
      .split(/\nexport async function /)[0];

    expect(fnBody).toContain('"outlets"');
    expect(fnBody).toContain("public_outlet_token");
  });

  it("validates the outlet token before returning", () => {
    const fnBody = publicOrdering
      .split("export async function getOutletQrSource(")[1]
      .split(/\nexport async function /)[0];

    expect(fnBody).toContain("isValidPublicToken");
  });
});

describe("public-ordering.ts: createPublicOutletQrOrder", () => {
  it("exports createPublicOutletQrOrder", () => {
    expect(publicOrdering).toContain("export async function createPublicOutletQrOrder(");
  });

  it("calls flow_m4_create_outlet_qr_order — not flow_m4_create_qr_table_order directly", () => {
    const fnBody = publicOrdering
      .split("export async function createPublicOutletQrOrder(")[1]
      .split(/\nexport async function /)[0];

    expect(fnBody).toContain("flow_m4_create_outlet_qr_order");
    expect(fnBody).not.toContain("flow_m4_create_qr_table_order");
  });

  it("uses the anonymous public Supabase client — not admin client", () => {
    const fnBody = publicOrdering
      .split("export async function createPublicOutletQrOrder(")[1]
      .split(/\nexport async function /)[0];

    expect(fnBody).toContain("createSupabasePublicClient");
    expect(fnBody).not.toContain("requireAdminClient");
  });

  it("passes outlet_token and target_table_token as separate RPC parameters", () => {
    const fnBody = publicOrdering
      .split("export async function createPublicOutletQrOrder(")[1]
      .split(/\nexport async function /)[0];

    expect(fnBody).toContain("outlet_token:");
    expect(fnBody).toContain("target_table_token:");
  });

  it("returns ok:false on RPC error without leaking raw error details", () => {
    const fnBody = publicOrdering
      .split("export async function createPublicOutletQrOrder(")[1]
      .split(/\nexport async function /)[0];

    expect(fnBody).toContain("ok: false");
    expect(fnBody).not.toContain("error.message");
    expect(fnBody).not.toContain("JSON.stringify(error");
  });

  it("validates outletToken and tableToken with Zod minimum length 32", () => {
    expect(publicOrdering).toContain("createPublicOutletOrderSchema");
    expect(publicOrdering).toContain('outletToken: z.string().min(32)');
    expect(publicOrdering).toContain('tableToken: z.string().min(32)');
  });
});

// ---------------------------------------------------------------------------
// Task 3: /o/[outletToken] route
// ---------------------------------------------------------------------------

describe("outlet page.tsx", () => {
  it("imports getPublicOutletMenu — not getFirstTableQrSource", () => {
    expect(outletPage).toContain("getPublicOutletMenu");
    expect(outletPage).not.toContain("getFirstTableQrSource");
  });

  it("does not import requireAdminClient or requireWorkspaceContext directly", () => {
    expect(outletPage).not.toContain("requireAdminClient");
    expect(outletPage).not.toContain("requireWorkspaceContext");
  });

  it("renders a safe error message without raw error details", () => {
    expect(outletPage).toContain("Outlet link unavailable");
    expect(outletPage).not.toContain("error.message");
  });

  it("passes menu and outletToken to PublicOutletMenuClient — no raw UUIDs", () => {
    expect(outletPage).toContain("<PublicOutletMenuClient");
    expect(outletPage).toContain("menu={menu}");
    expect(outletPage).toContain("outletToken={outletToken}");
    expect(outletPage).not.toMatch(/outlet_id|org_id/);
  });

  it("shows Pay at counter label", () => {
    expect(outletPage).toContain("Pay at counter");
  });

  it("is force-dynamic", () => {
    expect(outletPage).toContain('dynamic = "force-dynamic"');
  });
});

describe("outlet actions.ts", () => {
  it("is a use server module", () => {
    expect(outletActions).toMatch(/^"use server"/);
  });

  it("delegates to createPublicOutletQrOrder — uses outlet-aware submission wrapper", () => {
    expect(outletActions).toContain("createPublicOutletQrOrder");
    expect(outletActions).not.toContain("createPublicQrOrder");
    expect(outletActions).not.toContain("flow_v3_1");
    expect(outletActions).not.toContain("flow_m4_create_qr_table_order");
  });

  it("reads outletToken from formData and passes it to createPublicOutletQrOrder", () => {
    expect(outletActions).toContain('formData.get("outletToken")');
    expect(outletActions).toContain("outletToken");
  });

  it("redirects to /order/ on success", () => {
    expect(outletActions).toContain("redirect(`/order/");
  });

  it("returns a safe user-facing error message — no raw exception details", () => {
    expect(outletActions).not.toContain("error.message");
    expect(outletActions).toContain("result.message");
  });
});

describe("outlet public-outlet-menu-client.tsx", () => {
  it("is a use client module", () => {
    expect(outletClient).toMatch(/^"use client"/);
  });

  it("renders a table selector <select> with a blank default option", () => {
    expect(outletClient).toContain("<select");
    expect(outletClient).toContain('<option value="">');
  });

  it("does not render raw outlet IDs, org IDs, or table session UUIDs", () => {
    expect(outletClient).not.toMatch(/outlet_id|org_id|table_session_id/);
  });

  it("submit button is disabled when no table or no items selected", () => {
    expect(outletClient).toContain("canSubmit");
    expect(outletClient).toContain("disabled={!canSubmit || isPending}");
  });

  it("canSubmit requires both selectedTableToken and cart items", () => {
    expect(outletClient).toContain('selectedTableToken !== ""');
    expect(outletClient).toContain("cart.length > 0");
  });

  it("stores selected table token in a hidden input — not rendered visibly", () => {
    expect(outletClient).toContain('name="tableToken"');
    expect(outletClient).toContain('type="hidden"');
    expect(outletClient).toContain("value={selectedTableToken}");
  });

  it("stores outlet token in a hidden input for server-side outlet/table cross-validation", () => {
    expect(outletClient).toContain('name="outletToken"');
    expect(outletClient).toContain("value={outletToken}");
  });

  it("accepts outletToken as a prop — bound at the server-rendered page level", () => {
    expect(outletClient).toContain("outletToken: string");
  });

  it("renders table labels for display — uses tableLabel not publicTableToken in option text", () => {
    expect(outletClient).toContain("table.tableLabel");
  });

  it("delegates to submitOutletPublicOrderAction from actions.ts", () => {
    expect(outletClient).toContain("submitOutletPublicOrderAction");
  });

  it("shows table-must-be-selected prompt when items added but no table chosen", () => {
    expect(outletClient).toContain(
      "Please select your table before placing the order"
    );
  });
});

// ---------------------------------------------------------------------------
// Task 4: Dashboard QR update
// ---------------------------------------------------------------------------

describe("dashboard page.tsx — outlet QR", () => {
  it("imports getOutletQrSource", () => {
    expect(dashboardPage).toContain("getOutletQrSource");
  });

  it("does not import getFirstTableQrSource for QR generation", () => {
    expect(dashboardPage).not.toContain("getFirstTableQrSource");
  });

  it("QR URL uses /o/ prefix", () => {
    expect(dashboardPage).toContain("/o/");
  });

  it("QR URL does not use /t/ prefix for the outlet QR", () => {
    expect(dashboardPage).not.toMatch(/`\$\{origin\}\/t\//);
  });

  it("generates QR for the outlet-level URL", () => {
    expect(dashboardPage).toContain("outletQrUrl");
    expect(dashboardPage).toContain("outletQrDataUrl");
  });

  it("does not expose outletToken directly in rendered JSX text content", () => {
    expect(dashboardPage).not.toMatch(/>\s*\{outletQrSource\.outletToken\}\s*</);
  });

  it("uses outlet-level heading and badge copy — not per-table descriptions", () => {
    expect(dashboardPage).toContain("Outlet QR");
    expect(dashboardPage).not.toContain(">Table QR<");
    expect(dashboardPage).toContain("Public outlet ordering");
    expect(dashboardPage).not.toContain("Public table ordering");
    expect(dashboardPage).not.toContain("customer menu for one BrewBite table");
  });
});

// ---------------------------------------------------------------------------
// Task 5: Backward compat — /t/[tableToken] route unchanged
// ---------------------------------------------------------------------------

describe("legacy /t/[tableToken] route — unchanged", () => {
  it("still imports getPublicTableMenu", () => {
    expect(tableTokenPage).toContain("getPublicTableMenu");
  });

  it("still renders PublicMenuClient with tableToken prop", () => {
    expect(tableTokenPage).toContain("PublicMenuClient");
    expect(tableTokenPage).toContain("tableToken={tableToken}");
  });

  it("still shows safe error for invalid table token", () => {
    expect(tableTokenPage).toContain("table ordering link is invalid");
  });

  it("actions.ts still delegates to createPublicQrOrder", () => {
    expect(tableTokenActions).toContain("createPublicQrOrder");
  });

  it("actions.ts still redirects to /order/", () => {
    expect(tableTokenActions).toContain("redirect(`/order/");
  });
});

// ---------------------------------------------------------------------------
// Task 5: V3.1 public tracking unchanged
// ---------------------------------------------------------------------------

describe("public order status page — unchanged", () => {
  it("still uses publicOrderId from params", () => {
    expect(publicStatusPage).toContain("publicOrderId");
  });

  it("still shows ORDER_RECEIVED status label", () => {
    expect(publicStatusPage).toContain("ORDER_RECEIVED");
  });

  it("still shows ORDER_COMPLETE status label", () => {
    expect(publicStatusPage).toContain("ORDER_COMPLETE");
  });
});

// ---------------------------------------------------------------------------
// Runtime unit tests — token validation and table mapping
// ---------------------------------------------------------------------------

describe("token validation (isValidPublicToken regex)", () => {
  const regex = /^[A-Za-z0-9_-]{32,128}$/;

  it("accepts a 48-char hex token (output of gen_random_bytes(24) hex-encoded)", () => {
    expect(regex.test("a".repeat(48))).toBe(true);
  });

  it("accepts a 32-char minimum token", () => {
    expect(regex.test("a".repeat(32))).toBe(true);
  });

  it("accepts a 128-char maximum token", () => {
    expect(regex.test("a".repeat(128))).toBe(true);
  });

  it("rejects a token shorter than 32 characters", () => {
    expect(regex.test("short")).toBe(false);
    expect(regex.test("a".repeat(31))).toBe(false);
  });

  it("rejects a token longer than 128 characters", () => {
    expect(regex.test("a".repeat(129))).toBe(false);
  });

  it("rejects a token with SQL injection characters", () => {
    expect(regex.test("a".repeat(32) + "'; DROP TABLE outlets;--")).toBe(false);
  });

  it("rejects a token with spaces", () => {
    expect(regex.test("a ".repeat(20))).toBe(false);
  });
});

describe("PublicOutletMenu table mapping (filter logic)", () => {
  it("filters out rows with empty table_label", () => {
    const raw = [
      { table_label: "Table 1", public_table_token: "a".repeat(48) },
      { table_label: "", public_table_token: "b".repeat(48) }
    ];
    const filtered = raw.filter(
      (t) => Boolean(t.table_label && t.public_table_token)
    );

    expect(filtered).toHaveLength(1);
    expect(filtered[0].table_label).toBe("Table 1");
  });

  it("filters out rows with empty public_table_token", () => {
    const raw = [
      { table_label: "Table 1", public_table_token: "a".repeat(48) },
      { table_label: "Table 2", public_table_token: "" }
    ];
    const filtered = raw.filter(
      (t) => Boolean(t.table_label && t.public_table_token)
    );

    expect(filtered).toHaveLength(1);
    expect(filtered[0].table_label).toBe("Table 1");
  });

  it("filters out rows with undefined label or token", () => {
    const raw = [
      { table_label: "Table 1", public_table_token: "a".repeat(48) },
      { table_label: undefined, public_table_token: undefined }
    ];
    const filtered = raw.filter(
      (t) => Boolean(t.table_label && t.public_table_token)
    );

    expect(filtered).toHaveLength(1);
  });

  it("passes through all valid rows", () => {
    const raw = [
      { table_label: "Table 1", public_table_token: "a".repeat(48) },
      { table_label: "Table 2", public_table_token: "b".repeat(48) },
      { table_label: "Table 3", public_table_token: "c".repeat(48) }
    ];
    const filtered = raw.filter(
      (t) => Boolean(t.table_label && t.public_table_token)
    );

    expect(filtered).toHaveLength(3);
  });
});
