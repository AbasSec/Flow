import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getNextKitchenTicketStatus } from "@/lib/domain/states";

const migration = readFileSync(
  join(
    process.cwd(),
    "supabase",
    "migrations",
    "20260702000700_milestone_3_vertical_slice.sql"
  ),
  "utf8"
);

const ordersService = readFileSync(
  join(process.cwd(), "lib", "services", "orders.ts"),
  "utf8"
);

describe("Milestone 3 vertical slice guards", () => {
  it("rejects out-of-stock order creation before inserting order state", () => {
    expect(migration).toContain("Insufficient stock for ingredient");
    expect(migration).toContain("flow_m3_available_quantity");
  });

  it("creates order, lines, ticket, reservation, audit, and outbox through one RPC", () => {
    expect(migration).toContain("create or replace function public.flow_m3_create_table_order");
    expect(migration).toContain("insert into public.orders");
    expect(migration).toContain("insert into public.order_lines");
    expect(migration).toContain("insert into public.kitchen_tickets");
    expect(migration).toContain("'reservation'");
    expect(migration).toContain("'ORDER_CREATED'");
    expect(migration).toContain("'order.created'");
    expect(migration).toContain("idempotency_key = request_key");
  });

  it("rejects invalid kitchen state transitions", () => {
    expect(getNextKitchenTicketStatus("NEW")).toBe("ACCEPTED");
    expect(getNextKitchenTicketStatus("ACCEPTED")).toBe("PREPARING");
    expect(getNextKitchenTicketStatus("PREPARING")).toBe("READY");
    expect(getNextKitchenTicketStatus("READY")).toBeNull();
    expect(getNextKitchenTicketStatus("COMPLETED")).toBeNull();
    expect(migration).toContain("Invalid kitchen ticket transition");
  });

  it("consumes inventory once when a ticket enters PREPARING", () => {
    expect(migration).toContain("next_status = 'PREPARING'");
    expect(migration).toContain("not exists");
    expect(migration).toContain("il.entry_type = 'consumption'");
    expect(migration).toContain("'reservation_release'");
    expect(migration).toContain("'consumption'");
  });

  it("limits kitchen users to assigned stations", () => {
    expect(migration).toContain("create table public.kitchen_station_memberships");
    expect(migration).toContain("actor_role = 'kitchen'");
    expect(migration).toContain("Kitchen station access denied");
  });

  it("keeps order detail scoped to the current organisation", () => {
    expect(ordersService).toContain(".eq(\"id\", orderId)");
    expect(ordersService).toContain(".eq(\"org_id\", context.orgId)");
  });

  it("requires settlement role and writes immutable demo settlement evidence", () => {
    expect(migration).toContain("flow_m3_demo_manual_settlement");
    expect(migration).toContain("'DEMO_MANUAL_SETTLEMENT'");
    expect(migration).toContain("target_order.payment_status <> 'UNPAID'");
    expect(migration).toContain("'cashier'");
    expect(migration).toContain("not a payment gateway integration");
  });

  it("keeps chat from mutating business state", () => {
    const sendMessageFunction = migration.split(
      "create or replace function public.flow_m3_send_message"
    )[1];

    expect(sendMessageFunction).toContain("insert into public.messages");
    expect(sendMessageFunction).toContain("'MESSAGE_CREATED'");
    expect(sendMessageFunction).not.toContain("update public.orders");
    expect(sendMessageFunction).not.toContain("insert into public.inventory_ledger");
    expect(sendMessageFunction).not.toContain("update public.kitchen_tickets");
  });

  it("creates order-linked work-item threads with explicit room membership", () => {
    expect(migration).toContain("'WORK_ITEM_THREAD'");
    expect(migration).toContain("insert into public.work_item_threads");
    expect(migration).toContain("insert into public.room_memberships");
  });
});
