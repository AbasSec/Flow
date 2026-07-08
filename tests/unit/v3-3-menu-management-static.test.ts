import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase", "migrations", "20260707000100_v3_3_menu_management.sql"),
  "utf8"
);

const service = readFileSync(
  join(process.cwd(), "lib", "services", "menu-management.ts"),
  "utf8"
);

const actions = readFileSync(
  join(process.cwd(), "app", "app", "menu", "actions.ts"),
  "utf8"
);

const page = readFileSync(
  join(process.cwd(), "app", "app", "menu", "page.tsx"),
  "utf8"
);

const flowUi = readFileSync(
  join(process.cwd(), "components", "flow-ui.tsx"),
  "utf8"
);

const loading = readFileSync(
  join(process.cwd(), "app", "app", "loading.tsx"),
  "utf8"
);

// ── Migration: schema additions ───────────────────────────────────────────────

describe("V3.3 migration: schema additions", () => {
  it("adds is_sold_out column to menu_items", () => {
    expect(migration).toContain("add column if not exists is_sold_out boolean not null default false");
  });

  it("adds sold_out_reason column to menu_items", () => {
    expect(migration).toContain("add column if not exists sold_out_reason text null");
  });
});

// ── Migration: public availability ───────────────────────────────────────────

describe("V3.3 migration: flow_m4_public_item_available", () => {
  it("replaces with plpgsql to enable early return", () => {
    expect(migration).toContain(
      "create or replace function public.flow_m4_public_item_available("
    );
    expect(migration).toContain("language plpgsql");
  });

  it("short-circuits to false when is_sold_out is true", () => {
    expect(migration).toContain("and is_sold_out");
    expect(migration).toContain("return false");
  });

  it("preserves ingredient availability check", () => {
    expect(migration).toContain("flow_m3_available_quantity(target_outlet_id, required.ingredient_id)");
    expect(migration).toContain("rv.is_active");
  });

  it("re-applies deny-first grants to anon and authenticated", () => {
    expect(migration).toContain(
      "revoke all on function public.flow_m4_public_item_available(uuid, uuid, integer) from public"
    );
    expect(migration).toContain(
      "grant execute on function public.flow_m4_public_item_available(uuid, uuid, integer) to anon, authenticated"
    );
  });
});

// ── Migration: QR order submission ───────────────────────────────────────────

describe("V3.3 migration: flow_m4_create_qr_table_order", () => {
  it("replaces the function body", () => {
    expect(migration).toContain(
      "create or replace function public.flow_m4_create_qr_table_order("
    );
  });

  it("gates order submission on is_sold_out", () => {
    expect(migration).toContain("and not mi.is_sold_out");
  });

  it("preserves LEGACY/V3_1 lifecycle branching", () => {
    expect(migration).toContain("outlet_mode = 'LEGACY'");
    expect(migration).toContain("outlet_mode = 'V3_1'");
    expect(migration).toContain("RELEASE_BY_AUTHORISED_STAFF");
    expect(migration).toContain("NOT_RELEASED");
  });

  it("preserves inventory ledger path for LEGACY mode", () => {
    expect(migration).toContain("QR order inventory reservation (LEGACY outlet mode)");
  });

  it("preserves idempotency check", () => {
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain("'idempotent', true");
  });

  it("preserves audit and outbox writes", () => {
    expect(migration).toContain("QR_TABLE_ORDER_RECEIVED");
    expect(migration).toContain("order.qr_table_received");
  });

  it("grants to anon and authenticated (public RPC)", () => {
    expect(migration).toContain(
      "grant execute on function public.flow_m4_create_qr_table_order(text, jsonb, text) to anon, authenticated"
    );
  });
});

// ── Migration: management RPCs ────────────────────────────────────────────────

describe("V3.3 migration: management RPCs exist", () => {
  it("creates flow_v3_3_get_outlet_menu", () => {
    expect(migration).toContain("create or replace function public.flow_v3_3_get_outlet_menu(");
  });

  it("creates flow_v3_3_create_menu_category", () => {
    expect(migration).toContain("create or replace function public.flow_v3_3_create_menu_category(");
  });

  it("creates flow_v3_3_update_menu_category", () => {
    expect(migration).toContain("create or replace function public.flow_v3_3_update_menu_category(");
  });

  it("creates flow_v3_3_archive_menu_category", () => {
    expect(migration).toContain("create or replace function public.flow_v3_3_archive_menu_category(");
  });

  it("creates flow_v3_3_create_menu_item", () => {
    expect(migration).toContain("create or replace function public.flow_v3_3_create_menu_item(");
  });

  it("creates flow_v3_3_update_menu_item", () => {
    expect(migration).toContain("create or replace function public.flow_v3_3_update_menu_item(");
  });

  it("creates flow_v3_3_set_item_availability", () => {
    expect(migration).toContain("create or replace function public.flow_v3_3_set_item_availability(");
  });

  it("creates flow_v3_3_archive_menu_item", () => {
    expect(migration).toContain("create or replace function public.flow_v3_3_archive_menu_item(");
  });
});

describe("V3.3 migration: security model", () => {
  it("all management RPCs use SECURITY DEFINER with safe search_path", () => {
    const managementRpcs = [
      "flow_v3_3_get_outlet_menu",
      "flow_v3_3_create_menu_category",
      "flow_v3_3_update_menu_category",
      "flow_v3_3_archive_menu_category",
      "flow_v3_3_create_menu_item",
      "flow_v3_3_update_menu_item",
      "flow_v3_3_set_item_availability",
      "flow_v3_3_archive_menu_item"
    ];

    for (const rpc of managementRpcs) {
      const idx = migration.indexOf(`create or replace function public.${rpc}`);
      expect(idx, `${rpc} not found`).toBeGreaterThan(-1);
      const body = migration.slice(idx, idx + 600);
      expect(body, `${rpc} missing SECURITY DEFINER`).toContain("security definer");
      expect(body, `${rpc} missing safe search_path`).toContain(
        "set search_path = pg_catalog, pg_temp"
      );
    }
  });

  it("management RPCs call flow_v3_1_require_outlet_role", () => {
    expect(migration).toContain("flow_v3_1_require_outlet_role");
  });

  it("mutation RPCs check auth.uid() and reject unauthenticated callers", () => {
    expect(migration).toContain("actor_id uuid := auth.uid()");
    expect(migration).toContain("Authentication required");
  });

  it("set_item_availability allows manager role", () => {
    const idx = migration.indexOf(
      "create or replace function public.flow_v3_3_set_item_availability"
    );
    const nextFn = migration.indexOf(
      "revoke all on function public.flow_v3_3_set_item_availability",
      idx + 10
    );
    const body = migration.slice(idx, nextFn > 0 ? nextFn : idx + 2000);
    expect(body).toContain("'manager'");
  });

  it("create/update/archive RPCs do not allow manager role", () => {
    const ownerAdminOnly = [
      "flow_v3_3_create_menu_category",
      "flow_v3_3_update_menu_category",
      "flow_v3_3_archive_menu_category",
      "flow_v3_3_create_menu_item",
      "flow_v3_3_update_menu_item",
      "flow_v3_3_archive_menu_item"
    ];

    for (const rpc of ownerAdminOnly) {
      const idx = migration.indexOf(`create or replace function public.${rpc}`);
      const nextFn = migration.indexOf("create or replace function public.", idx + 10);
      const body = migration.slice(idx, nextFn > 0 ? nextFn : idx + 1200);
      const roleArrayEnd = body.indexOf("]::public.org_role[]");
      const roleArray = body.slice(0, roleArrayEnd);
      expect(roleArray, `${rpc} should not include 'manager' in allowed roles`).not.toContain(
        "'manager'"
      );
    }
  });

  it("deny-first grants for management RPCs: revoke from anon, grant only to authenticated", () => {
    const rpcs = [
      "flow_v3_3_get_outlet_menu(uuid)",
      "flow_v3_3_create_menu_category(uuid, text, integer)",
      "flow_v3_3_update_menu_category(uuid, uuid, text, integer)",
      "flow_v3_3_archive_menu_category(uuid, uuid)",
      "flow_v3_3_create_menu_item(uuid, uuid, text, text, bigint, boolean, uuid)",
      "flow_v3_3_update_menu_item(uuid, uuid, text, text, bigint, boolean, uuid)",
      "flow_v3_3_set_item_availability(uuid, uuid, boolean, text)",
      "flow_v3_3_archive_menu_item(uuid, uuid)"
    ];

    for (const rpc of rpcs) {
      expect(migration, `${rpc} missing revoke from anon`).toContain(
        `revoke all on function public.${rpc} from anon`
      );
      expect(migration, `${rpc} missing grant to authenticated`).toContain(
        `grant execute on function public.${rpc} to authenticated`
      );
      expect(migration, `${rpc} must not grant to anon`).not.toContain(
        `grant execute on function public.${rpc} to anon`
      );
    }
  });

  it("archive_category blocks when active items remain", () => {
    const idx = migration.indexOf(
      "create or replace function public.flow_v3_3_archive_menu_category"
    );
    const body = migration.slice(idx, idx + 1500);
    expect(body).toContain("Archive all active items before archiving this category");
  });

  it("audit_events written for every mutation RPC", () => {
    const actions = [
      "MENU_CATEGORY_CREATED",
      "MENU_CATEGORY_UPDATED",
      "MENU_CATEGORY_ARCHIVED",
      "MENU_ITEM_CREATED",
      "MENU_ITEM_UPDATED",
      "MENU_ITEM_MARKED_SOLD_OUT",
      "MENU_ITEM_MARKED_AVAILABLE",
      "MENU_ITEM_ARCHIVED"
    ];

    for (const action of actions) {
      expect(migration, `Missing audit action ${action}`).toContain(action);
    }
  });

  it("does not touch flow_v3_1_* functions", () => {
    expect(migration).not.toContain("create or replace function public.flow_v3_1_");
  });

  it("does not modify order_lines, inventory_ledger, or kitchen_tickets schema", () => {
    expect(migration).not.toContain("alter table public.order_lines");
    expect(migration).not.toContain("alter table public.inventory_ledger");
    expect(migration).not.toContain("alter table public.kitchen_tickets");
  });

  it("does not regenerate public_menu_token values", () => {
    expect(migration).not.toContain("set public_menu_token");
  });

  it("uses soft-delete only (is_active = false, never DELETE)", () => {
    expect(migration).not.toContain("delete from public.menu_categories");
    expect(migration).not.toContain("delete from public.menu_items");
    expect(migration).toContain("is_active = false");
  });
});

// ── Service layer ─────────────────────────────────────────────────────────────

describe("V3.3 service: menu-management.ts", () => {
  it("imports server-only guard", () => {
    expect(service).toContain('import "server-only"');
  });

  it("uses createSupabaseServerClient for RPC calls", () => {
    expect(service).toContain("createSupabaseServerClient");
    expect(service).toContain('from "@/lib/db/server"');
  });

  it("uses requireAdminClient for outlet lookup (not for RPC)", () => {
    expect(service).toContain("requireAdminClient");
  });

  it("enforces MANAGEMENT_ROLES guard before outlet lookup", () => {
    expect(service).toContain("MANAGEMENT_ROLES");
    expect(service).toContain("roleIn(context.role, MANAGEMENT_ROLES)");
  });

  it("wraps all RPC calls in ServiceResult", () => {
    expect(service).toContain("ok: true");
    expect(service).toContain("ok: false");
  });

  it("does not expose raw RPC errors", () => {
    expect(service).not.toContain("error.message");
    expect(service).not.toContain("throw error");
  });

  it("exports all required service functions", () => {
    expect(service).toContain("export async function getOutletMenuForManagement");
    expect(service).toContain("export async function createMenuCategory");
    expect(service).toContain("export async function updateMenuCategory");
    expect(service).toContain("export async function archiveMenuCategory");
    expect(service).toContain("export async function createMenuItem");
    expect(service).toContain("export async function updateMenuItem");
    expect(service).toContain("export async function setItemAvailability");
    expect(service).toContain("export async function archiveMenuItem");
  });

  it("calls the correct V3.3 RPC names", () => {
    expect(service).toContain('"flow_v3_3_get_outlet_menu"');
    expect(service).toContain('"flow_v3_3_create_menu_category"');
    expect(service).toContain('"flow_v3_3_update_menu_category"');
    expect(service).toContain('"flow_v3_3_archive_menu_category"');
    expect(service).toContain('"flow_v3_3_create_menu_item"');
    expect(service).toContain('"flow_v3_3_update_menu_item"');
    expect(service).toContain('"flow_v3_3_set_item_availability"');
    expect(service).toContain('"flow_v3_3_archive_menu_item"');
  });
});

// ── Server actions ────────────────────────────────────────────────────────────

describe("V3.3 actions: app/app/menu/actions.ts", () => {
  it("is a server module", () => {
    expect(actions).toContain('"use server"');
  });

  it("revalidates /app/menu after every mutation", () => {
    const count = (actions.match(/revalidatePath\("\/app\/menu"\)/g) ?? []).length;
    expect(count).toBeGreaterThanOrEqual(7);
  });

  it("exports all required actions", () => {
    expect(actions).toContain("export async function createCategoryAction");
    expect(actions).toContain("export async function updateCategoryAction");
    expect(actions).toContain("export async function archiveCategoryAction");
    expect(actions).toContain("export async function createItemAction");
    expect(actions).toContain("export async function updateItemAction");
    expect(actions).toContain("export async function setAvailabilityAction");
    expect(actions).toContain("export async function archiveItemAction");
  });
});

// ── Page ──────────────────────────────────────────────────────────────────────

describe("V3.3 page: app/app/menu/page.tsx", () => {
  it("is force-dynamic", () => {
    expect(page).toContain('export const dynamic = "force-dynamic"');
  });

  it("calls requireWorkspaceContext", () => {
    expect(page).toContain("requireWorkspaceContext");
  });

  it("enforces MANAGEMENT_ROLES guard before rendering", () => {
    expect(page).toContain("MANAGEMENT_ROLES");
    expect(page).toContain("roleIn(context.role, MANAGEMENT_ROLES)");
  });

  it("gates edit controls on owner/admin role", () => {
    expect(page).toContain('"organisation_owner"');
    expect(page).toContain('"organisation_admin"');
    expect(page).toContain("canEdit");
  });

  it("shows sold-out badge when isSoldOut", () => {
    expect(page).toContain("isSoldOut");
    expect(page).toContain("Sold out");
  });

  it("renders availability toggle for all management roles", () => {
    expect(page).toContain("setAvailabilityAction");
    expect(page).toContain("Mark available");
    expect(page).toContain("Mark sold out");
  });

  it("renders archive controls only for canEdit roles", () => {
    expect(page).toContain("archiveItemAction");
    expect(page).toContain("archiveCategoryAction");
  });
});

// ── Navigation ────────────────────────────────────────────────────────────────

describe("V3.3 navigation: flow-ui.tsx", () => {
  it("adds MENU_VISIBLE_ROLES constant", () => {
    expect(flowUi).toContain("MENU_VISIBLE_ROLES");
    expect(flowUi).toContain('"organisation_owner"');
    expect(flowUi).toContain('"organisation_admin"');
    expect(flowUi).toContain('"manager"');
  });

  it("adds Menu nav link conditionally for management roles", () => {
    expect(flowUi).toContain("showMenu");
    expect(flowUi).toContain('href="/app/menu"');
    expect(flowUi).toContain("Menu");
  });

  it("does not show Menu link to cashier, waiter, kitchen, storekeeper roles", () => {
    const menuRoles = flowUi.match(/MENU_VISIBLE_ROLES\s*=\s*new Set\(\[([\s\S]*?)\]\)/)?.[1] ?? "";
    expect(menuRoles).not.toContain("cashier");
    expect(menuRoles).not.toContain("waiter");
    expect(menuRoles).not.toContain("kitchen");
  });
});

// ── Loading shell: nav slot preservation ─────────────────────────────────────

describe("V3.3 loading shell: Menu nav slot", () => {
  it("AppShell accepts reserveMenuSlot prop to reserve the Menu nav slot", () => {
    expect(flowUi).toContain("reserveMenuSlot");
    expect(flowUi).toContain("MenuNavPlaceholder");
    expect(flowUi).toContain("showMenuPlaceholder");
  });

  it("loading screen reserves both Counter and Menu nav slots", () => {
    expect(loading).toContain("reserveCounterSlot");
    expect(loading).toContain("reserveMenuSlot");
  });

  it("Menu placeholder is non-clickable (span element, no href)", () => {
    const fnStart = flowUi.indexOf("function MenuNavPlaceholder");
    expect(fnStart, "MenuNavPlaceholder function not found").toBeGreaterThan(-1);
    const fnBody = flowUi.slice(fnStart, fnStart + 400);
    expect(fnBody).not.toContain("href");
    expect(fnBody).not.toContain("<Link");
    expect(fnBody).not.toContain("<a ");
  });

  it("real Menu NavLink is role-gated: only shown when showMenu is true", () => {
    expect(flowUi).toContain("MENU_VISIBLE_ROLES.has(role)");
    const menuLinkIdx = flowUi.indexOf('href="/app/menu"');
    expect(menuLinkIdx, "/app/menu href not found").toBeGreaterThan(-1);
    const surroundingCode = flowUi.slice(menuLinkIdx - 200, menuLinkIdx + 50);
    expect(surroundingCode).toContain("showMenu");
  });

  it("Counter placeholder behavior is unchanged", () => {
    expect(flowUi).toContain("reserveCounterSlot");
    expect(flowUi).toContain("CounterNavPlaceholder");
    expect(flowUi).toContain("showCounterPlaceholder");
    const fnStart = flowUi.indexOf("function CounterNavPlaceholder");
    expect(fnStart, "CounterNavPlaceholder function not found").toBeGreaterThan(-1);
    const fnBody = flowUi.slice(fnStart, fnStart + 250);
    expect(fnBody).not.toContain("href");
    expect(fnBody).not.toContain("<Link");
  });
});
