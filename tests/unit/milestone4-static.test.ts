import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(
    process.cwd(),
    "supabase",
    "migrations",
    "20260702000800_public_qr_ordering.sql"
  ),
  "utf8"
);

const publicService = readFileSync(
  join(process.cwd(), "lib", "services", "public-ordering.ts"),
  "utf8"
);

const connectRoute = readFileSync(
  join(process.cwd(), "app", "app", "connect", "page.tsx"),
  "utf8"
);

const migrationFunctionNames = [
  "flow_m4_public_item_available(uuid, uuid, integer)",
  "flow_m4_public_menu(text)",
  "flow_m4_create_qr_table_order(text, jsonb, text)",
  "flow_m4_public_order_status(text)"
] as const;

const publicCallableFunctions = [
  "flow_m4_public_menu(text)",
  "flow_m4_create_qr_table_order(text, jsonb, text)",
  "flow_m4_public_order_status(text)"
] as const;

const inheritedApplicationFunctions = [
  "set_updated_at()",
  "current_user_id()",
  "is_active_org_member(uuid)",
  "current_org_role(uuid)",
  "has_org_permission(uuid, text)",
  "is_active_site_member(uuid)",
  "is_active_outlet_member(uuid)",
  "is_active_room_member(uuid)",
  "has_current_communication_policy_ack(uuid, uuid)",
  "has_active_review_access(uuid)",
  "can_read_room(uuid)",
  "can_send_message_to_room(uuid)",
  "prevent_inventory_ledger_mutation()",
  "flow_m3_current_role(uuid)",
  "flow_m3_require_role(uuid, public.org_role[])",
  "flow_m3_available_quantity(uuid, uuid)",
  "flow_m3_create_table_order(uuid, jsonb, text)",
  "flow_m3_transition_kitchen_ticket(uuid, public.kitchen_ticket_status)",
  "flow_m3_demo_manual_settlement(uuid)",
  "flow_m3_send_message(uuid, text, text)"
] as const;

const inheritedAuthenticatedFunctions = [
  "current_user_id()",
  "is_active_org_member(uuid)",
  "current_org_role(uuid)",
  "has_org_permission(uuid, text)",
  "is_active_site_member(uuid)",
  "is_active_outlet_member(uuid)",
  "is_active_room_member(uuid)",
  "has_current_communication_policy_ack(uuid, uuid)",
  "has_active_review_access(uuid)",
  "can_read_room(uuid)",
  "can_send_message_to_room(uuid)",
  "flow_m3_current_role(uuid)",
  "flow_m3_require_role(uuid, public.org_role[])",
  "flow_m3_available_quantity(uuid, uuid)",
  "flow_m3_create_table_order(uuid, jsonb, text)",
  "flow_m3_transition_kitchen_ticket(uuid, public.kitchen_ticket_status)",
  "flow_m3_demo_manual_settlement(uuid)",
  "flow_m3_send_message(uuid, text, text)"
] as const;

describe("Milestone 4 public QR ordering guards", () => {
  it("uses opaque table, menu, and public order tracking tokens", () => {
    expect(migration).toContain("public_table_token text");
    expect(migration).toContain("public_menu_token text");
    expect(migration).toContain("public_tracking_token text");
    expect(migration).toContain("extensions.gen_random_bytes(24)");
    expect(migration).not.toContain("grant select on table public.table_sessions to anon");
  });

  it("returns safe public menu fields only", () => {
    expect(migration).toContain("flow_m4_public_menu");
    expect(migration).toContain("'table_label'");
    expect(migration).toContain("'public_menu_token'");
    expect(migration).toContain("'price_sen'");
    expect(migration).toContain("'available'");
    expect(migration).not.toContain("'org_id'");
    expect(migration).not.toContain("'outlet_id'");
    expect(migration).not.toContain("'ingredient_id'");
    expect(publicService).not.toContain("SUPABASE_SECRET_KEY");
  });

  it("does not let public QR order override price, outlet, table, or raw item ids", () => {
    expect(migration).toContain("join public.menu_items mi on mi.public_menu_token = req.menu_token");
    expect(migration).toContain("mi.outlet_id = target_table.outlet_id");
    expect(migration).toContain("mi.price_sen");
    expect(migration).not.toContain("item ->> 'price'");
    expect(migration).not.toContain("item ->> 'outlet_id'");
    expect(migration).not.toContain("item ->> 'table_session_id'");
  });

  it("creates unpaid public order, ticket, reservation, audit, and outbox exactly through the RPC", () => {
    expect(migration).toContain("create or replace function public.flow_m4_create_qr_table_order");
    expect(migration).toContain("insert into public.orders");
    expect(migration).toContain("'qr'");
    expect(migration).toContain("'UNPAID'");
    expect(migration).toContain("insert into public.order_lines");
    expect(migration).toContain("insert into public.kitchen_tickets");
    expect(migration).toContain("insert into public.inventory_ledger");
    expect(migration).toContain("'reservation'");
    expect(migration).toContain("'QR_TABLE_ORDER_CREATED'");
    expect(migration).toContain("'order.qr_table_created'");
  });

  it("prevents duplicate submission with idempotency", () => {
    expect(migration).toContain("idempotency_key = 'qr:' || target_table.public_table_token || ':' || request_key");
    expect(migration).toContain("'idempotent', true");
  });

  it("rejects duplicate menu tokens before creating request rows", () => {
    const duplicateGuard = migration.indexOf("having count(*) > 1");
    const requestInsert = migration.indexOf("insert into flow_public_order_request");

    expect(duplicateGuard).toBeGreaterThan(0);
    expect(requestInsert).toBeGreaterThan(duplicateGuard);
  });

  it("rejects a SQL NULL cart payload before JSON inspection or side effects", () => {
    const nullGuard = migration.indexOf("if order_items is null then");
    const typeGuard = migration.indexOf("jsonb_typeof(order_items)");
    const lengthGuard = migration.indexOf("jsonb_array_length(order_items)");
    const firstBusinessWrite = migration.indexOf("insert into public.orders");

    expect(nullGuard).toBeGreaterThan(0);
    expect(typeGuard).toBeGreaterThan(nullGuard);
    expect(lengthGuard).toBeGreaterThan(nullGuard);
    expect(firstBusinessWrite).toBeGreaterThan(nullGuard);
    expect(migration).toContain("raise exception 'Invalid order request'");
  });

  it("validates public cart payload before converting quantities to integers", () => {
    const numericGuard = migration.indexOf("(oi.value ->> 'quantity') !~ '^[0-9]+$'");
    const integerCast = migration.indexOf("(item.value ->> 'quantity')::integer");

    expect(migration).toContain("if order_items is null then");
    expect(migration).toContain("jsonb_typeof(order_items) <> 'array'");
    expect(migration).toContain("jsonb_array_length(order_items) > 20");
    expect(migration).toContain("jsonb_typeof(value) <> 'object'");
    expect(migration).toContain("fields.field_name not in ('public_menu_token', 'quantity')");
    expect(migration).toContain("Invalid order request");
    expect(migration).not.toContain("(item ->> 'quantity')::integer");
    expect(numericGuard).toBeGreaterThan(0);
    expect(integerCast).toBeGreaterThan(numericGuard);
  });

  it("rejects sold-out or unavailable items", () => {
    expect(migration).toContain("raise exception 'Invalid order request'");
    expect(migration).toContain("flow_m3_available_quantity");
  });

  it("requires table tokens to be active and unexpired while preserving valid token defaults", () => {
    expect(migration).toContain("alter column public_table_token set default encode(extensions.gen_random_bytes(24), 'hex')");
    expect(migration).toContain("alter column public_token_expires_at set default (now() + interval '30 days')");
    expect(migration).toContain("ts.public_token_expires_at is not null");
    expect(migration).toContain("ts.public_token_expires_at > now()");
    expect(migration).not.toContain("ts.public_token_expires_at is null or ts.public_token_expires_at > now()");
  });

  it("keeps public status narrow and resistant to order guessing", () => {
    const statusFunction = migration.split(
      "create or replace function public.flow_m4_public_order_status"
    )[1];

    expect(migration).toContain("flow_m4_public_order_status");
    expect(statusFunction).toContain("public_tracking_token = public_order_token");
    expect(statusFunction).toContain("public_tracking_expires_at > now()");
    expect(statusFunction).not.toContain("'payment_status'");
    expect(statusFunction).not.toContain("'staff'");
    expect(statusFunction).not.toContain("'room_id'");
  });

  it("does not grant public tenant-table or Flow Connect access", () => {
    expect(migration).not.toMatch(/grant\s+select\s+on\s+table[\s\S]*\bto\s+anon/i);
    expect(migration).not.toMatch(/grant\s+insert\s+on\s+table[\s\S]*\bto\s+anon/i);
    expect(migration).not.toContain("flow_m4_send_message");
    expect(connectRoute).toContain("getConnectData");
  });

  it("does not expose the raw UUID availability helper to public roles", () => {
    expect(migration).toContain(
      "revoke all on function public.flow_m4_public_item_available(uuid, uuid, integer) from public"
    );
    expect(migration).toContain(
      "revoke all on function public.flow_m4_public_item_available(uuid, uuid, integer) from anon"
    );
    expect(migration).toContain(
      "revoke all on function public.flow_m4_public_item_available(uuid, uuid, integer) from authenticated"
    );
    expect(migration).not.toContain(
      "grant execute on function public.flow_m4_public_item_available(uuid, uuid, integer)"
    );
    expect(publicService).not.toContain("flow_m4_public_item_available");
  });

  it("explicitly revokes PUBLIC execute before intended public RPC grants", () => {
    for (const functionName of migrationFunctionNames) {
      expect(migration).toContain(`revoke all on function public.${functionName} from public`);
    }

    for (const functionName of publicCallableFunctions) {
      const revokeIndex = migration.indexOf(`revoke all on function public.${functionName} from public`);
      const grantIndex = migration.indexOf(`grant execute on function public.${functionName} to anon, authenticated`);

      expect(grantIndex).toBeGreaterThan(revokeIndex);
    }
  });

  it("hardens inherited application functions against PUBLIC and anon execution", () => {
    for (const functionName of inheritedApplicationFunctions) {
      expect(migration).toContain(`revoke all on function public.${functionName} from public`);
      expect(migration).toContain(`revoke all on function public.${functionName} from anon`);
    }
  });

  it("keeps protected internal functions executable only by authenticated users", () => {
    for (const functionName of inheritedAuthenticatedFunctions) {
      const revokeIndex = migration.indexOf(`revoke all on function public.${functionName} from authenticated`);
      const grantIndex = migration.indexOf(`grant execute on function public.${functionName} to authenticated`);

      expect(revokeIndex).toBeGreaterThan(0);
      expect(grantIndex).toBeGreaterThan(revokeIndex);
    }
  });

  it("allows anon execute only for the three approved public QR RPCs", () => {
    const anonGrants = [
      ...migration.matchAll(/grant execute on function public\.([^(]+\([^;]+?\)) to anon/g)
    ].map((match) => match[1]);

    expect(migration).toContain("grant usage on schema public to anon");
    expect(anonGrants).toEqual([...publicCallableFunctions]);
  });

  it("uses locked search paths for every migration 008 security definer function", () => {
    const searchPathMatches = migration.match(
      /security definer\s+set search_path = pg_catalog, pg_temp/g
    );

    expect(searchPathMatches).toHaveLength(4);
    expect(migration).not.toContain("set search_path = public");
  });

  it("does not create payment records or claim gateway checkout", () => {
    expect(migration).not.toContain("payment_attempts");
    expect(migration).not.toContain("payment_callbacks");
    expect(migration).not.toContain("Billplz");
    expect(publicService).toContain("Pay at counter");
  });
});
