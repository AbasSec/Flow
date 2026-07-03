import "server-only";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabasePublicClient } from "@/lib/db/public";
import { requireAdminClient, serviceError, type ServiceResult } from "@/lib/services/context";

const publicOrderItemSchema = z.object({
  publicMenuToken: z.string().min(32).max(128),
  quantity: z.number().int().min(1).max(20)
});

const createPublicOrderSchema = z.object({
  tableToken: z.string().min(32).max(128),
  items: z.array(publicOrderItemSchema).min(1).max(20),
  requestKey: z.string().min(8).max(120)
});

export type PublicMenuItem = {
  publicMenuToken: string;
  name: string;
  description: string | null;
  priceSen: number;
  available: boolean;
};

export type PublicMenuCategory = {
  name: string;
  items: PublicMenuItem[];
};

export type PublicTableMenu = {
  outletName: string;
  tableLabel: string;
  paymentLabel: string;
  categories: PublicMenuCategory[];
};

export type PublicOrderStatus = {
  status:
    | "ORDER_RECEIVED"
    | "ACCEPTED"
    | "PREPARING"
    | "READY"
    | "ORDER_COMPLETE"
    | "UNAVAILABLE";
  tableLabel: string | null;
  submittedAt: string;
  paymentLabel: string;
};

export type TableQrSource = {
  tableLabel: string;
  tableToken: string;
};

type PublicMenuRpc = {
  found?: boolean;
  outlet_name?: string;
  table_label?: string;
  payment_label?: string;
  categories?: Array<{
    name?: string;
    items?: Array<{
      public_menu_token?: string;
      name?: string;
      description?: string | null;
      price_sen?: number;
      available?: boolean;
    }>;
  }>;
};

type PublicStatusRpc = {
  found?: boolean;
  status?: string;
  table_label?: string | null;
  submitted_at?: string;
  payment_label?: string;
};

type PublicCreateRpc = {
  public_order_id?: string;
  idempotent?: boolean;
  payment_status?: string;
  payment_label?: string;
};

export async function getPublicTableMenu(
  tableToken: string
): Promise<ServiceResult<PublicTableMenu>> {
  try {
    const supabase = createSupabasePublicClient();

    if (!supabase) {
      return { ok: false, reason: "unconfigured", message: "Ordering is not configured." };
    }

    const { data, error } = await supabase.rpc("flow_m4_public_menu", {
      target_table_token: tableToken
    });

    if (error) {
      return { ok: false, reason: "error", message: "This table menu is unavailable." };
    }

    const menu = data as PublicMenuRpc | null;

    if (!menu?.found) {
      return { ok: false, reason: "not_found", message: "This table link is unavailable." };
    }

    return {
      ok: true,
      data: {
        outletName: menu.outlet_name ?? "BrewBite Kitchen",
        tableLabel: menu.table_label ?? "Table",
        paymentLabel: menu.payment_label ?? "Pay at counter",
        categories: (menu.categories ?? []).map((category) => ({
          name: category.name ?? "Menu",
          items: (category.items ?? []).map((item) => ({
            publicMenuToken: item.public_menu_token ?? "",
            name: item.name ?? "Item",
            description: item.description ?? null,
            priceSen: Number(item.price_sen ?? 0),
            available: Boolean(item.available)
          }))
        }))
      }
    };
  } catch (error) {
    return { ok: false, reason: "error", message: serviceError(error) };
  }
}

export async function createPublicQrOrder(
  input: unknown
): Promise<ServiceResult<{ publicOrderId: string; idempotent: boolean }>> {
  try {
    const parsed = createPublicOrderSchema.parse(input);
    const supabase = createSupabasePublicClient();

    if (!supabase) {
      return { ok: false, reason: "unconfigured", message: "Ordering is not configured." };
    }

    const { data, error } = await supabase.rpc("flow_m4_create_qr_table_order", {
      target_table_token: parsed.tableToken,
      order_items: parsed.items.map((item) => ({
        public_menu_token: item.publicMenuToken,
        quantity: item.quantity
      })),
      request_key: parsed.requestKey
    });

    if (error) {
      return {
        ok: false,
        reason: "error",
        message: "One or more items are unavailable. Please refresh the menu."
      };
    }

    const result = data as PublicCreateRpc | null;

    if (!result?.public_order_id) {
      return { ok: false, reason: "error", message: "Order submission failed." };
    }

    revalidatePath(`/order/${result.public_order_id}`);

    return {
      ok: true,
      data: {
        publicOrderId: result.public_order_id,
        idempotent: Boolean(result.idempotent)
      }
    };
  } catch (error) {
    return { ok: false, reason: "error", message: serviceError(error) };
  }
}

export async function getPublicOrderStatus(
  publicOrderId: string
): Promise<ServiceResult<PublicOrderStatus>> {
  try {
    const supabase = createSupabasePublicClient();

    if (!supabase) {
      return { ok: false, reason: "unconfigured", message: "Order tracking is not configured." };
    }

    const { data, error } = await supabase.rpc("flow_m4_public_order_status", {
      public_order_token: publicOrderId
    });

    if (error) {
      return { ok: false, reason: "error", message: "Order tracking is unavailable." };
    }

    const status = data as PublicStatusRpc | null;

    if (!status?.found || !status.status || !status.submitted_at) {
      return { ok: false, reason: "not_found", message: "This order link is unavailable or expired." };
    }

    return {
      ok: true,
      data: {
        status: normalizePublicStatus(status.status),
        tableLabel: status.table_label ?? null,
        submittedAt: status.submitted_at,
        paymentLabel: status.payment_label ?? "Pay at counter"
      }
    };
  } catch (error) {
    return { ok: false, reason: "error", message: serviceError(error) };
  }
}

function normalizePublicStatus(status: string): PublicOrderStatus["status"] {
  if (
    status === "ORDER_RECEIVED" ||
    status === "ACCEPTED" ||
    status === "PREPARING" ||
    status === "READY" ||
    status === "ORDER_COMPLETE" ||
    status === "UNAVAILABLE"
  ) {
    return status;
  }

  if (
    status === "SERVED" ||
    status === "COLLECTED" ||
    status === "SERVED_OR_COLLECTED" ||
    status === "COMPLETED"
  ) {
    return "ORDER_COMPLETE";
  }

  return "UNAVAILABLE";
}

export async function getFirstTableQrSource(
  orgId: string
): Promise<TableQrSource | null> {
  const admin = requireAdminClient();
  const { data, error } = await admin
    .from("table_sessions")
    .select("table_label, public_table_token, public_token_expires_at")
    .eq("org_id", orgId)
    .in("status", ["AVAILABLE", "OPEN"])
    .not("public_table_token", "is", null)
    .not("public_token_expires_at", "is", null)
    .gt("public_token_expires_at", new Date().toISOString())
    .order("table_label")
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  const row = data as {
    table_label: string;
    public_table_token: string | null;
    public_token_expires_at: string | null;
  } | null;

  if (!isValidPublicTableToken(row?.public_table_token)) {
    return null;
  }

  return {
    tableLabel: row.table_label,
    tableToken: row.public_table_token
  };
}

function isValidPublicTableToken(token: string | null | undefined): token is string {
  return Boolean(token && /^[A-Za-z0-9_-]{32,128}$/.test(token));
}
