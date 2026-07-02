import "server-only";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/db/server";
import {
  ORDER_ENTRY_ROLES,
  SETTLEMENT_ROLES,
  type ServiceResult,
  type WorkspaceContext,
  requireAdminClient,
  requireWorkspaceContext,
  roleIn,
  serviceError
} from "@/lib/services/context";

const orderItemSchema = z.object({
  menuItemId: z.string().uuid(),
  quantity: z.number().int().min(1).max(20)
});

const createOrderSchema = z.object({
  tableSessionId: z.string().uuid(),
  items: z.array(orderItemSchema).min(1).max(20),
  requestKey: z.string().min(8).max(120)
});

export type TableOption = {
  id: string;
  label: string;
  status: string;
};

export type MenuItemOption = {
  id: string;
  categoryName: string;
  name: string;
  description: string | null;
  priceSen: number;
  stationName: string | null;
};

export type WaiterData = {
  context: WorkspaceContext;
  outletId: string;
  tables: TableOption[];
  menuItems: MenuItemOption[];
};

export type OrderSummary = {
  id: string;
  tableLabel: string | null;
  serviceStatus: string;
  paymentStatus: string;
  totalSen: number;
  createdAt: string;
};

export type OrderDetail = {
  id: string;
  outletId: string;
  tableLabel: string | null;
  serviceStatus: string;
  paymentStatus: string;
  subtotalSen: number;
  totalSen: number;
  createdAt: string;
  lines: Array<{
    id: string;
    name: string;
    quantity: number;
    unitPriceSen: number;
    lineTotalSen: number;
  }>;
  tickets: Array<{
    id: string;
    status: string;
    stationName: string;
    createdAt: string;
  }>;
  threadRoomId: string | null;
};

type OutletRow = { id: string };
type TableRow = { id: string; table_label: string; status: string };
type MenuRow = {
  id: string;
  name: string;
  description: string | null;
  price_sen: number;
  menu_categories: { name: string } | { name: string }[] | null;
  kitchen_stations: { name: string } | { name: string }[] | null;
};
type OrderRow = {
  id: string;
  outlet_id: string;
  service_status: string;
  payment_status: string;
  subtotal_sen: number;
  total_sen: number;
  created_at: string;
  table_sessions: { table_label: string } | { table_label: string }[] | null;
};
type OrderLineRow = {
  id: string;
  item_name_snapshot: string;
  unit_price_sen: number;
  quantity: number;
  line_total_sen: number;
};
type TicketRow = {
  id: string;
  status: string;
  created_at: string;
  kitchen_stations: { name: string } | { name: string }[] | null;
};
type ThreadRow = { room_id: string };

function firstName(row: { name: string } | { name: string }[] | null): string | null {
  if (Array.isArray(row)) {
    return row[0]?.name ?? null;
  }

  return row?.name ?? null;
}

function firstTableLabel(
  row: { table_label: string } | { table_label: string }[] | null
): string | null {
  if (Array.isArray(row)) {
    return row[0]?.table_label ?? null;
  }

  return row?.table_label ?? null;
}

export async function getPrimaryOutletId(orgId: string): Promise<string | null> {
  const admin = requireAdminClient();
  const { data, error } = await admin
    .from("outlets")
    .select("id")
    .eq("org_id", orgId)
    .eq("is_active", true)
    .order("created_at")
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return ((data as OutletRow | null) ?? null)?.id ?? null;
}

export async function getWaiterData(): Promise<ServiceResult<WaiterData>> {
  try {
    const context = await requireWorkspaceContext();

    if (!roleIn(context.role, ORDER_ENTRY_ROLES)) {
      return {
        ok: false,
        reason: "forbidden",
        message: "Your role cannot create table-service orders."
      };
    }

    const outletId = await getPrimaryOutletId(context.orgId);

    if (!outletId) {
      return { ok: false, reason: "not_found", message: "No active outlet found." };
    }

    const admin = requireAdminClient();
    const [tablesResult, menuResult] = await Promise.all([
      admin
        .from("table_sessions")
        .select("id, table_label, status")
        .eq("org_id", context.orgId)
        .eq("outlet_id", outletId)
        .in("status", ["AVAILABLE", "OPEN"])
        .order("table_label"),
      admin
        .from("menu_items")
        .select(
          "id, name, description, price_sen, menu_categories(name), kitchen_stations(name)"
        )
        .eq("org_id", context.orgId)
        .eq("outlet_id", outletId)
        .eq("is_active", true)
        .order("name")
    ]);

    if (tablesResult.error) {
      throw tablesResult.error;
    }

    if (menuResult.error) {
      throw menuResult.error;
    }

    return {
      ok: true,
      data: {
        context,
        outletId,
        tables: ((tablesResult.data ?? []) as TableRow[]).map((row) => ({
          id: row.id,
          label: row.table_label,
          status: row.status
        })),
        menuItems: ((menuResult.data ?? []) as MenuRow[]).map((row) => ({
          id: row.id,
          categoryName: firstName(row.menu_categories) ?? "Menu",
          name: row.name,
          description: row.description,
          priceSen: Number(row.price_sen),
          stationName: firstName(row.kitchen_stations)
        }))
      }
    };
  } catch (error) {
    return { ok: false, reason: "error", message: serviceError(error) };
  }
}

export async function createTableOrder(input: unknown): Promise<ServiceResult<{ orderId: string }>> {
  try {
    const parsed = createOrderSchema.parse(input);
    await requireWorkspaceContext();
    const supabase = await createSupabaseServerClient();

    if (!supabase) {
      return { ok: false, reason: "unconfigured", message: "Supabase is not configured." };
    }

    const { data, error } = await supabase.rpc("flow_m3_create_table_order", {
      target_table_session_id: parsed.tableSessionId,
      order_items: parsed.items.map((item) => ({
        menu_item_id: item.menuItemId,
        quantity: item.quantity
      })),
      request_key: parsed.requestKey
    });

    if (error) {
      return { ok: false, reason: "error", message: error.message };
    }

    const result = data as { order_id?: string } | null;

    if (!result?.order_id) {
      return { ok: false, reason: "error", message: "Order creation returned no id." };
    }

    revalidatePath("/app");
    revalidatePath("/app/waiter");
    revalidatePath("/app/kitchen");
    revalidatePath("/app/connect");

    return { ok: true, data: { orderId: result.order_id } };
  } catch (error) {
    return { ok: false, reason: "error", message: serviceError(error) };
  }
}

export async function settleOrderManually(orderId: string): Promise<ServiceResult<{ orderId: string }>> {
  try {
    const context = await requireWorkspaceContext();

    if (!roleIn(context.role, SETTLEMENT_ROLES)) {
      return {
        ok: false,
        reason: "forbidden",
        message: "Only owner, admin, manager, or cashier can record demo settlement."
      };
    }

    const supabase = await createSupabaseServerClient();

    if (!supabase) {
      return { ok: false, reason: "unconfigured", message: "Supabase is not configured." };
    }

    const { data, error } = await supabase.rpc("flow_m3_demo_manual_settlement", {
      target_order_id: orderId
    });

    if (error) {
      return { ok: false, reason: "error", message: error.message };
    }

    const result = data as { order_id?: string } | null;

    revalidatePath("/app");
    revalidatePath(`/app/orders/${orderId}`);

    return { ok: true, data: { orderId: result?.order_id ?? orderId } };
  } catch (error) {
    return { ok: false, reason: "error", message: serviceError(error) };
  }
}

export async function getRecentOrders(
  orgId: string,
  limit = 8
): Promise<OrderSummary[]> {
  const admin = requireAdminClient();
  const { data, error } = await admin
    .from("orders")
    .select(
      "id, service_status, payment_status, total_sen, created_at, table_sessions(table_label)"
    )
    .eq("org_id", orgId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw error;
  }

  return ((data ?? []) as OrderRow[]).map((row) => ({
    id: row.id,
    tableLabel: firstTableLabel(row.table_sessions),
    serviceStatus: row.service_status,
    paymentStatus: row.payment_status,
    totalSen: Number(row.total_sen),
    createdAt: row.created_at
  }));
}

export async function getOrderDetail(orderId: string): Promise<ServiceResult<OrderDetail>> {
  try {
    const context = await requireWorkspaceContext();
    const admin = requireAdminClient();

    const { data: orderData, error: orderError } = await admin
      .from("orders")
      .select(
        "id, outlet_id, service_status, payment_status, subtotal_sen, total_sen, created_at, table_sessions(table_label)"
      )
      .eq("id", orderId)
      .eq("org_id", context.orgId)
      .maybeSingle();

    if (orderError) {
      throw orderError;
    }

    if (!orderData) {
      return { ok: false, reason: "not_found", message: "Order was not found." };
    }

    const order = orderData as OrderRow;
    const [linesResult, ticketsResult, threadResult] = await Promise.all([
      admin
        .from("order_lines")
        .select("id, item_name_snapshot, unit_price_sen, quantity, line_total_sen")
        .eq("org_id", context.orgId)
        .eq("order_id", order.id)
        .order("created_at"),
      admin
        .from("kitchen_tickets")
        .select("id, status, created_at, kitchen_stations(name)")
        .eq("org_id", context.orgId)
        .eq("order_id", order.id)
        .order("created_at"),
      admin
        .from("work_item_threads")
        .select("room_id")
        .eq("org_id", context.orgId)
        .eq("entity_type", "ORDER")
        .eq("entity_id", order.id)
        .maybeSingle()
    ]);

    if (linesResult.error) {
      throw linesResult.error;
    }

    if (ticketsResult.error) {
      throw ticketsResult.error;
    }

    if (threadResult.error) {
      throw threadResult.error;
    }

    return {
      ok: true,
      data: {
        id: order.id,
        outletId: order.outlet_id,
        tableLabel: firstTableLabel(order.table_sessions),
        serviceStatus: order.service_status,
        paymentStatus: order.payment_status,
        subtotalSen: Number(order.subtotal_sen),
        totalSen: Number(order.total_sen),
        createdAt: order.created_at,
        lines: ((linesResult.data ?? []) as OrderLineRow[]).map((line) => ({
          id: line.id,
          name: line.item_name_snapshot,
          quantity: line.quantity,
          unitPriceSen: Number(line.unit_price_sen),
          lineTotalSen: Number(line.line_total_sen)
        })),
        tickets: ((ticketsResult.data ?? []) as TicketRow[]).map((ticket) => ({
          id: ticket.id,
          status: ticket.status,
          stationName: firstName(ticket.kitchen_stations) ?? "Station",
          createdAt: ticket.created_at
        })),
        threadRoomId: ((threadResult.data as ThreadRow | null) ?? null)?.room_id ?? null
      }
    };
  } catch (error) {
    return { ok: false, reason: "error", message: serviceError(error) };
  }
}
