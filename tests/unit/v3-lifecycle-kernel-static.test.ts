import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getNextKitchenTicketStatus } from "@/lib/domain/states";
import {
  isOrderClosureState,
  isOrderFulfilmentState,
  isOrderReleasePolicy,
  isOrderReleaseState,
  isOutletLifecycleMode
} from "@/lib/domain/lifecycle";

const migration = readFileSync(
  join(
    process.cwd(),
    "supabase",
    "migrations",
    "20260703000200_v3_1_lifecycle_kernel.sql"
  ),
  "utf8"
);

const publicOrderService = readFileSync(
  join(process.cwd(), "lib", "services", "public-ordering.ts"),
  "utf8"
);

const orderService = readFileSync(
  join(process.cwd(), "lib", "services", "orders.ts"),
  "utf8"
);

const kitchenService = readFileSync(
  join(process.cwd(), "lib", "services", "kitchen.ts"),
  "utf8"
);

const orderDetailPage = readFileSync(
  join(process.cwd(), "app", "app", "orders", "[id]", "page.tsx"),
  "utf8"
);

const publicStatusPage = readFileSync(
  join(process.cwd(), "app", "order", "[publicOrderId]", "page.tsx"),
  "utf8"
);

const publicTablePage = readFileSync(
  join(process.cwd(), "app", "t", "[tableToken]", "page.tsx"),
  "utf8"
);

function functionBody(signature: string): string {
  const parts = migration.split(signature);

  expect(parts.length).toBeGreaterThan(1);

  return parts[1].split(/\ncreate or replace function public\./)[0];
}

describe("V3.1 lifecycle kernel guards", () => {
  it("adds separate release, fulfilment, closure, and lifecycle evidence surfaces", () => {
    expect(migration).toContain("create type public.order_release_policy");
    expect(migration).toContain("create type public.order_release_state");
    expect(migration).toContain("create type public.order_fulfilment_state");
    expect(migration).toContain("create type public.order_closure_state");
    expect(migration).toContain("create table public.order_lifecycle_events");
    expect(migration).toContain("add column release_policy");
    expect(migration).toContain("add column fulfilment_state");
    expect(migration).toContain("add column closure_state");
    expect(isOrderReleasePolicy("RELEASE_BY_AUTHORISED_STAFF")).toBe(true);
    expect(isOrderReleaseState("NOT_RELEASED")).toBe(true);
    expect(isOrderFulfilmentState("READY_FOR_HANDOFF")).toBe(true);
    expect(isOrderClosureState("COMPLETE")).toBe(true);
  });

  it("enforces outlet scope inside every lifecycle mutation boundary", () => {
    const helper = functionBody("create or replace function public.flow_v3_1_require_outlet_role");

    expect(helper).toContain("from public.outlets o");
    expect(helper).toContain("join public.sites s");
    expect(helper).toContain("public.flow_m3_require_role");
    expect(helper).toContain("actor_role in ('organisation_owner', 'organisation_admin')");
    expect(helper).toContain("public.is_active_site_member(target_outlet.site_id)");
    expect(helper).toContain("Outlet access denied");

    [
      "create or replace function public.flow_v3_1_create_table_order",
      "create or replace function public.flow_v3_1_confirm_manual_settlement",
      "create or replace function public.flow_v3_1_release_order_to_kitchen",
      "create or replace function public.flow_v3_1_transition_kitchen_ticket",
      "create or replace function public.flow_v3_1_mark_order_served",
      "create or replace function public.flow_v3_1_mark_order_collected"
    ].forEach((signature) => {
      expect(functionBody(signature)).toContain("public.flow_v3_1_require_outlet_role");
    });

    expect(functionBody("create or replace function public.flow_v3_1_transition_kitchen_ticket")).toContain(
      "Kitchen station access denied"
    );
  });

  it("keeps table-service release-on-submit kitchen work intact", () => {
    expect(migration).toContain("flow_v3_1_create_table_order");
    expect(migration).toContain("'RELEASE_ON_SUBMIT'");
    expect(migration).toContain("'RELEASED'");
    expect(migration).toContain("insert into public.kitchen_tickets");
    expect(migration).toContain("insert into public.inventory_ledger");
    expect(orderService).toContain("flow_v3_1_create_table_order");
  });

  it("wraps legacy M3 mutation RPCs so they cannot bypass V3.1 lifecycle policy", () => {
    const legacyOrderWrapper = functionBody("create or replace function public.flow_m3_create_table_order");
    const legacyKitchenWrapper = functionBody(
      "create or replace function public.flow_m3_transition_kitchen_ticket"
    );
    const legacyCompatImpl = functionBody(
      "create or replace function public.flow_m3_legacy_transition_kitchen_ticket_v1"
    );
    const legacySettlementWrapper = functionBody(
      "create or replace function public.flow_m3_demo_manual_settlement"
    );

    expect(legacyOrderWrapper).toContain("return public.flow_v3_1_create_table_order");
    expect(legacyOrderWrapper).not.toContain("insert into public.orders");
    // Wrapper branches: V3_1 outlet + lifecycle_version >= 3 → V3.1 path; else → legacy path.
    expect(legacyKitchenWrapper).toContain("outlet_mode = 'V3_1'");
    expect(legacyKitchenWrapper).toContain("lifecycle_version");
    expect(legacyKitchenWrapper).toContain("return public.flow_v3_1_transition_kitchen_ticket");
    expect(legacyKitchenWrapper).toContain("return public.flow_m3_legacy_transition_kitchen_ticket_v1");
    // Wrapper itself must NOT contain the V3.1 COMPLETED rejection — that lives in flow_v3_1_transition_kitchen_ticket.
    expect(legacyKitchenWrapper).not.toContain("Kitchen stops at READY");
    // Legacy compat: preserves READY → COMPLETED for LEGACY outlets (migration-007 behaviour).
    expect(legacyCompatImpl).toContain("when 'COMPLETED' then 5");
    expect(legacyCompatImpl).not.toContain("Kitchen stops at READY");
    // Internal compat function must not be callable externally.
    expect(migration).toContain(
      "revoke all on function public.flow_m3_legacy_transition_kitchen_ticket_v1(uuid, public.kitchen_ticket_status) from authenticated"
    );
    expect(migration).not.toContain(
      "grant execute on function public.flow_m3_legacy_transition_kitchen_ticket_v1"
    );
    expect(legacySettlementWrapper).toContain("return public.flow_v3_1_confirm_manual_settlement");
    expect(legacySettlementWrapper).not.toContain("update public.orders");
  });

  it("keeps QR pay-at-counter orders out of kitchen until settlement and release in V3_1 mode", () => {
    const qrFunction = migration.split(
      "create or replace function public.flow_m4_create_qr_table_order"
    )[1].split("create or replace function public.flow_v3_1_confirm_manual_settlement")[0];

    // Must branch on outlet lifecycle mode
    expect(qrFunction).toContain("outlet_mode");
    expect(qrFunction).toContain("outlet_mode = 'V3_1'");
    expect(qrFunction).toContain("outlet_mode = 'LEGACY'");

    // Split at the LEGACY branch comment to isolate the two paths
    const legacyBranchSplit = qrFunction.split("-- LEGACY MODE:");
    expect(legacyBranchSplit.length).toBeGreaterThan(1);
    const v3_1PathContent = legacyBranchSplit[0];
    const legacyPathContent = legacyBranchSplit[1];

    // V3_1 path (before LEGACY comment): release held until authorised staff confirms
    expect(v3_1PathContent).toContain("'RELEASE_BY_AUTHORISED_STAFF'");
    expect(v3_1PathContent).toContain("'NOT_RELEASED'");
    expect(v3_1PathContent).not.toContain("insert into public.kitchen_tickets");
    expect(v3_1PathContent).not.toContain("insert into public.inventory_ledger");

    // LEGACY path (after LEGACY comment): tickets and reservation created immediately
    expect(legacyPathContent).toContain("insert into public.kitchen_tickets");
    expect(legacyPathContent).toContain("insert into public.inventory_ledger");

    // Audit event captures mode-dependent kitchen work flag
    expect(qrFunction).toContain("kitchen_work_created");
    expect(qrFunction).toContain("'QR_TABLE_ORDER_RECEIVED'");
  });

  it("restricts lifecycle activation to Owner-only one-way enable — admin and downgrades denied", () => {
    expect(migration).toContain("create type public.outlet_lifecycle_mode");
    expect(migration).toContain("'LEGACY'");
    expect(migration).toContain("'V3_1'");
    expect(migration).toContain("add column lifecycle_mode public.outlet_lifecycle_mode not null default 'LEGACY'");
    expect(migration).toContain("flow_v3_1_enable_outlet_v3_1");
    // Old two-argument signature must NOT exist
    expect(migration).not.toContain("flow_v3_1_set_outlet_lifecycle_mode(");
    expect(isOutletLifecycleMode("LEGACY")).toBe(true);
    expect(isOutletLifecycleMode("V3_1")).toBe(true);
    expect(isOutletLifecycleMode("UNKNOWN")).toBe(false);

    const enableFunction = functionBody(
      "create or replace function public.flow_v3_1_enable_outlet_v3_1"
    );

    // Must call the outlet-scope helper with ONLY organisation_owner in the allowed array
    expect(enableFunction).toContain("public.flow_v3_1_require_outlet_role");
    expect(enableFunction).toContain("array['organisation_owner']");
    // Admin must NOT appear in the allowed-roles array for this specific RPC
    expect(enableFunction).not.toContain("array['organisation_owner', 'organisation_admin']");
    // Defence-in-depth check must explicitly guard against admin even if helper is extended
    expect(enableFunction).toContain("actor_role <> 'organisation_owner'");
    expect(enableFunction).toContain("Organisation Owner authority");
    // One-way: sets V3_1 only — no mode parameter, no path to set LEGACY
    expect(enableFunction).toContain("lifecycle_mode = 'V3_1'");
    expect(enableFunction).not.toContain("lifecycle_mode = 'LEGACY'");
    // Idempotency: already-V3_1 path returns changed=false without auditing
    expect(enableFunction).toContain("current_mode = 'V3_1'");
    expect(enableFunction).toContain("'changed', false");
    // Audit evidence must record the mode change
    expect(enableFunction).toContain("'OUTLET_LIFECYCLE_MODE_CHANGED'");
    // Privilege grants: authenticated-only, no anon
    expect(migration).toContain(
      "revoke all on function public.flow_v3_1_enable_outlet_v3_1(uuid) from anon"
    );
    expect(migration).toContain(
      "grant execute on function public.flow_v3_1_enable_outlet_v3_1(uuid) to authenticated"
    );
  });

  it("authorises manual settlement and release as separate idempotent actions", () => {
    expect(migration).toContain("flow_v3_1_confirm_manual_settlement");
    expect(migration).toContain("flow_v3_1_release_order_to_kitchen");
    expect(migration).toContain("if target_order.payment_status = 'PAID' then");
    expect(migration).toContain("if target_order.release_state = 'RELEASED' then");
    expect(migration).toContain("Manual settlement must be confirmed before kitchen release");
    expect(migration).toContain("'ORDER_RELEASED_TO_KITCHEN'");
    expect(migration).toContain("'cashier'");
    expect(orderService).toContain("flow_v3_1_confirm_manual_settlement");
    expect(orderService).toContain("flow_v3_1_release_order_to_kitchen");
    expect(migration).toContain("if target_order.release_state = 'RELEASED' then");
    expect(migration).toContain("on conflict do nothing");
  });

  it("stops kitchen progression at READY for V3 records", () => {
    const v3KitchenFunction = functionBody(
      "create or replace function public.flow_v3_1_transition_kitchen_ticket"
    );

    expect(getNextKitchenTicketStatus("NEW")).toBe("ACCEPTED");
    expect(getNextKitchenTicketStatus("ACCEPTED")).toBe("PREPARING");
    expect(getNextKitchenTicketStatus("PREPARING")).toBe("READY");
    expect(getNextKitchenTicketStatus("READY")).toBeNull();
    expect(kitchenService).toContain("flow_v3_1_transition_kitchen_ticket");
    expect(kitchenService).toContain("z.enum([\"ACCEPTED\", \"PREPARING\", \"READY\"])");
    expect(v3KitchenFunction).toContain("next_status not in ('ACCEPTED', 'PREPARING', 'READY')");
    expect(v3KitchenFunction).not.toContain("when 'COMPLETED' then 5");
  });

  it("derives handoff readiness and keeps fulfilment front-of-house owned", () => {
    expect(migration).toContain("'READY_FOR_HANDOFF'");
    expect(migration).toContain("All required kitchen work is READY");
    expect(migration).toContain("flow_v3_1_mark_order_served");
    expect(migration).toContain("flow_v3_1_mark_order_collected");
    expect(migration).toContain("'waiter'");
    expect(migration).toContain("Dine-in order served by authorised front-of-house user");
    expect(orderDetailPage).toContain("actionKind=\"served\"");
    expect(migration).toContain("target_order.order_channel not in ('table', 'qr')");
    expect(migration).toContain("target_order.order_channel not in ('counter', 'online_pickup')");
  });

  it("keeps public tracking truthful through release and fulfilment", () => {
    expect(migration).toContain("when target_order.release_state = 'NOT_RELEASED' then 'ORDER_RECEIVED'");
    expect(migration).toContain("when ticket_progress = 2 then 'ACCEPTED'");
    expect(migration).toContain("when ticket_progress = 3 then 'PREPARING'");
    expect(migration).toContain("when ticket_progress = 4 then 'READY'");
    expect(migration).toContain("target_order.fulfilment_state in ('SERVED', 'COLLECTED')");
    expect(publicStatusPage).toContain("Order received — please pay at counter.");
    expect(publicOrderService).toContain("return \"ORDER_COMPLETE\"");
    expect(publicTablePage).not.toContain("send the order to the kitchen");
    expect(publicTablePage).toContain("send the order to staff");
  });

  it("preserves legacy terminal readability without inventing served or collected truth", () => {
    expect(migration).toContain(
      "when target_order.lifecycle_version = 1 and target_order.service_status in ('SERVED_OR_COLLECTED', 'COMPLETED') then 'ORDER_COMPLETE'"
    );
    expect(migration).toContain("when target_order.lifecycle_version = 1 and ticket_progress = 5 then 'ORDER_COMPLETE'");
    expect(migration).toContain("Backfills must not invent");
    expect(orderDetailPage).toContain("Legacy / not yet evidenced");
  });

  it("keeps RPC grants narrow and adds no anonymous tenant-table grants", () => {
    expect(migration).toContain(
      "revoke all on function public.flow_v3_1_transition_kitchen_ticket(uuid, public.kitchen_ticket_status) from anon"
    );
    expect(migration).toContain(
      "grant execute on function public.flow_v3_1_transition_kitchen_ticket(uuid, public.kitchen_ticket_status) to authenticated"
    );
    expect(migration).toContain(
      "revoke all on function public.flow_m3_transition_kitchen_ticket(uuid, public.kitchen_ticket_status) from authenticated"
    );
    expect(migration).toContain(
      "grant execute on function public.flow_m3_transition_kitchen_ticket(uuid, public.kitchen_ticket_status) to authenticated"
    );
    expect(migration).toContain(
      "grant execute on function public.flow_m4_create_qr_table_order(text, jsonb, text) to anon, authenticated"
    );
    expect(migration).toContain(
      "grant execute on function public.flow_m4_public_order_status(text) to anon, authenticated"
    );

    const tablePrivilegeGrantsToAnon = migration
      .split("\n")
      .filter((line) => /^grant\s+(select|insert|update|delete)\b/i.test(line.trim()))
      .filter((line) => /\bto\s+anon\b/i.test(line));

    expect(tablePrivilegeGrantsToAnon).toEqual([]);
  });

  it("does not surface raw database errors from changed lifecycle services", () => {
    expect(orderService).not.toContain("message: error.message");
    expect(kitchenService).not.toContain("message: error.message");
    expect(orderService).toContain("Settlement could not be recorded for this order.");
    expect(orderService).toContain("Order could not be released.");
    expect(kitchenService).toContain("Kitchen ticket could not be moved to the requested state.");
  });
});
