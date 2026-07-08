import "server-only";

import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/db/server";
import {
  requireAdminClient,
  serviceError,
  type ServiceResult,
  type WorkspaceContext,
  MANAGEMENT_ROLES,
  roleIn
} from "@/lib/services/context";

// ── Types ─────────────────────────────────────────────────────────────────────

export type MenuStation = {
  id: string;
  name: string;
};

export type MenuItem = {
  id: string;
  name: string;
  description: string | null;
  priceSen: number;
  isPublic: boolean;
  isSoldOut: boolean;
  soldOutReason: string | null;
  stationId: string | null;
  stationName: string | null;
};

export type MenuCategory = {
  id: string;
  name: string;
  sortOrder: number;
  items: MenuItem[];
};

export type OutletMenuForManagement = {
  outletId: string;
  stations: MenuStation[];
  categories: MenuCategory[];
};

// ── Zod schemas (form-compatible: accept strings/null from FormData) ───────────

const boolFromForm = z.preprocess((v) => v === "true" || v === true, z.boolean());
const nullableText = z.preprocess(
  (v) => (v === "" || v == null ? null : String(v)),
  z.string().max(1000).nullable().optional()
);
const nullableUuid = z.preprocess(
  (v) => (v === "" || v == null ? null : String(v)),
  z.string().uuid().nullable().optional()
);

export const createCategorySchema = z.object({
  outletId: z.string().uuid(),
  name: z.string().min(1, "Name is required").max(100),
  sortOrder: z.coerce.number().int().min(0).max(999).default(0)
});

export const updateCategorySchema = z.object({
  outletId: z.string().uuid(),
  categoryId: z.string().uuid(),
  name: z.string().min(1, "Name is required").max(100),
  sortOrder: z.coerce.number().int().min(0).max(999).default(0)
});

export const archiveCategorySchema = z.object({
  outletId: z.string().uuid(),
  categoryId: z.string().uuid()
});

export const createItemSchema = z.object({
  outletId: z.string().uuid(),
  categoryId: z.string().uuid(),
  name: z.string().min(1, "Name is required").max(200),
  description: nullableText,
  priceSen: z.coerce.number().int().min(0, "Price cannot be negative"),
  isPublic: boolFromForm,
  stationId: nullableUuid
});

export const updateItemSchema = z.object({
  outletId: z.string().uuid(),
  itemId: z.string().uuid(),
  name: z.string().min(1, "Name is required").max(200),
  description: nullableText,
  priceSen: z.coerce.number().int().min(0, "Price cannot be negative"),
  isPublic: boolFromForm,
  stationId: nullableUuid
});

export const setAvailabilitySchema = z.object({
  outletId: z.string().uuid(),
  itemId: z.string().uuid(),
  soldOut: boolFromForm,
  reason: z.preprocess(
    (v) => (v === "" || v == null ? null : String(v)),
    z.string().max(500).nullable().optional()
  )
});

export const archiveItemSchema = z.object({
  outletId: z.string().uuid(),
  itemId: z.string().uuid()
});

// ── RPC response shapes ───────────────────────────────────────────────────────

type GetOutletMenuRpc = {
  outlet_id?: string;
  stations?: Array<{ id?: string; name?: string }>;
  categories?: Array<{
    id?: string;
    name?: string;
    sort_order?: number;
    items?: Array<{
      id?: string;
      name?: string;
      description?: string | null;
      price_sen?: number;
      is_public?: boolean;
      is_sold_out?: boolean;
      sold_out_reason?: string | null;
      station_id?: string | null;
      station_name?: string | null;
    }>;
  }>;
};

// ── Service functions ─────────────────────────────────────────────────────────

export async function getOutletMenuForManagement(
  context: WorkspaceContext
): Promise<ServiceResult<OutletMenuForManagement>> {
  try {
    if (!roleIn(context.role, MANAGEMENT_ROLES)) {
      return { ok: false, reason: "forbidden", message: "Menu access requires management role." };
    }

    const admin = requireAdminClient();
    const { data: outlet, error: outletError } = await admin
      .from("outlets")
      .select("id")
      .eq("org_id", context.orgId)
      .eq("is_active", true)
      .order("created_at")
      .limit(1)
      .maybeSingle();

    if (outletError) {
      return { ok: false, reason: "error", message: "Menu is unavailable." };
    }

    if (!outlet) {
      return { ok: false, reason: "unconfigured", message: "No active outlet found." };
    }

    const supabase = await createSupabaseServerClient();
    if (!supabase) {
      return { ok: false, reason: "unconfigured", message: "Supabase is not configured." };
    }
    const { data, error } = await supabase.rpc("flow_v3_3_get_outlet_menu", {
      target_outlet_id: (outlet as { id: string }).id
    });

    if (error) {
      return { ok: false, reason: "error", message: "Menu is unavailable." };
    }

    const result = data as GetOutletMenuRpc | null;

    if (!result?.outlet_id) {
      return { ok: false, reason: "not_found", message: "Menu is unavailable." };
    }

    return {
      ok: true,
      data: {
        outletId: result.outlet_id,
        stations: (result.stations ?? []).map((s) => ({
          id: s.id ?? "",
          name: s.name ?? ""
        })),
        categories: (result.categories ?? []).map((c) => ({
          id: c.id ?? "",
          name: c.name ?? "",
          sortOrder: c.sort_order ?? 0,
          items: (c.items ?? []).map((i) => ({
            id: i.id ?? "",
            name: i.name ?? "",
            description: i.description ?? null,
            priceSen: Number(i.price_sen ?? 0),
            isPublic: Boolean(i.is_public),
            isSoldOut: Boolean(i.is_sold_out),
            soldOutReason: i.sold_out_reason ?? null,
            stationId: i.station_id ?? null,
            stationName: i.station_name ?? null
          }))
        }))
      }
    };
  } catch (error) {
    return { ok: false, reason: "error", message: serviceError(error) };
  }
}

export async function createMenuCategory(
  input: unknown
): Promise<ServiceResult<{ categoryId: string; name: string }>> {
  try {
    const parsed = createCategorySchema.parse(input);
    const supabase = await createSupabaseServerClient();
    if (!supabase) {
      return { ok: false, reason: "unconfigured", message: "Supabase is not configured." };
    }
    const { data, error } = await supabase.rpc("flow_v3_3_create_menu_category", {
      target_outlet_id: parsed.outletId,
      p_name: parsed.name,
      p_sort_order: parsed.sortOrder
    });

    if (error) {
      return { ok: false, reason: "error", message: "Failed to create category." };
    }

    const result = data as { category_id?: string; name?: string } | null;

    if (!result?.category_id) {
      return { ok: false, reason: "error", message: "Failed to create category." };
    }

    return { ok: true, data: { categoryId: result.category_id, name: result.name ?? parsed.name } };
  } catch (error) {
    return { ok: false, reason: "error", message: serviceError(error) };
  }
}

export async function updateMenuCategory(
  input: unknown
): Promise<ServiceResult<{ categoryId: string; name: string }>> {
  try {
    const parsed = updateCategorySchema.parse(input);
    const supabase = await createSupabaseServerClient();
    if (!supabase) {
      return { ok: false, reason: "unconfigured", message: "Supabase is not configured." };
    }
    const { data, error } = await supabase.rpc("flow_v3_3_update_menu_category", {
      target_outlet_id: parsed.outletId,
      target_category_id: parsed.categoryId,
      p_name: parsed.name,
      p_sort_order: parsed.sortOrder
    });

    if (error) {
      return { ok: false, reason: "error", message: "Failed to update category." };
    }

    const result = data as { category_id?: string; name?: string } | null;

    if (!result?.category_id) {
      return { ok: false, reason: "error", message: "Failed to update category." };
    }

    return { ok: true, data: { categoryId: result.category_id, name: result.name ?? parsed.name } };
  } catch (error) {
    return { ok: false, reason: "error", message: serviceError(error) };
  }
}

export async function archiveMenuCategory(
  input: unknown
): Promise<ServiceResult<{ categoryId: string }>> {
  try {
    const parsed = archiveCategorySchema.parse(input);
    const supabase = await createSupabaseServerClient();
    if (!supabase) {
      return { ok: false, reason: "unconfigured", message: "Supabase is not configured." };
    }
    const { data, error } = await supabase.rpc("flow_v3_3_archive_menu_category", {
      target_outlet_id: parsed.outletId,
      target_category_id: parsed.categoryId
    });

    if (error) {
      return {
        ok: false,
        reason: "error",
        message: "Failed to archive category. Ensure all items are archived first."
      };
    }

    const result = data as { category_id?: string } | null;

    if (!result?.category_id) {
      return { ok: false, reason: "error", message: "Failed to archive category." };
    }

    return { ok: true, data: { categoryId: result.category_id } };
  } catch (error) {
    return { ok: false, reason: "error", message: serviceError(error) };
  }
}

export async function createMenuItem(
  input: unknown
): Promise<ServiceResult<{ itemId: string; name: string }>> {
  try {
    const parsed = createItemSchema.parse(input);
    const supabase = await createSupabaseServerClient();
    if (!supabase) {
      return { ok: false, reason: "unconfigured", message: "Supabase is not configured." };
    }
    const { data, error } = await supabase.rpc("flow_v3_3_create_menu_item", {
      target_outlet_id: parsed.outletId,
      p_category_id: parsed.categoryId,
      p_name: parsed.name,
      p_description: parsed.description ?? null,
      p_price_sen: parsed.priceSen,
      p_is_public: parsed.isPublic,
      p_station_id: parsed.stationId ?? null
    });

    if (error) {
      return { ok: false, reason: "error", message: "Failed to create item." };
    }

    const result = data as { item_id?: string; name?: string } | null;

    if (!result?.item_id) {
      return { ok: false, reason: "error", message: "Failed to create item." };
    }

    return { ok: true, data: { itemId: result.item_id, name: result.name ?? parsed.name } };
  } catch (error) {
    return { ok: false, reason: "error", message: serviceError(error) };
  }
}

export async function updateMenuItem(
  input: unknown
): Promise<ServiceResult<{ itemId: string; name: string }>> {
  try {
    const parsed = updateItemSchema.parse(input);
    const supabase = await createSupabaseServerClient();
    if (!supabase) {
      return { ok: false, reason: "unconfigured", message: "Supabase is not configured." };
    }
    const { data, error } = await supabase.rpc("flow_v3_3_update_menu_item", {
      target_outlet_id: parsed.outletId,
      target_item_id: parsed.itemId,
      p_name: parsed.name,
      p_description: parsed.description ?? null,
      p_price_sen: parsed.priceSen,
      p_is_public: parsed.isPublic,
      p_station_id: parsed.stationId ?? null
    });

    if (error) {
      return { ok: false, reason: "error", message: "Failed to update item." };
    }

    const result = data as { item_id?: string; name?: string } | null;

    if (!result?.item_id) {
      return { ok: false, reason: "error", message: "Failed to update item." };
    }

    return { ok: true, data: { itemId: result.item_id, name: result.name ?? parsed.name } };
  } catch (error) {
    return { ok: false, reason: "error", message: serviceError(error) };
  }
}

export async function setItemAvailability(
  input: unknown
): Promise<ServiceResult<{ itemId: string; isSoldOut: boolean }>> {
  try {
    const parsed = setAvailabilitySchema.parse(input);
    const supabase = await createSupabaseServerClient();
    if (!supabase) {
      return { ok: false, reason: "unconfigured", message: "Supabase is not configured." };
    }
    const { data, error } = await supabase.rpc("flow_v3_3_set_item_availability", {
      target_outlet_id: parsed.outletId,
      target_item_id: parsed.itemId,
      p_sold_out: parsed.soldOut,
      p_reason: parsed.reason ?? null
    });

    if (error) {
      return { ok: false, reason: "error", message: "Failed to update item availability." };
    }

    const result = data as { item_id?: string; is_sold_out?: boolean } | null;

    if (!result?.item_id) {
      return { ok: false, reason: "error", message: "Failed to update item availability." };
    }

    return { ok: true, data: { itemId: result.item_id, isSoldOut: Boolean(result.is_sold_out) } };
  } catch (error) {
    return { ok: false, reason: "error", message: serviceError(error) };
  }
}

export async function archiveMenuItem(
  input: unknown
): Promise<ServiceResult<{ itemId: string }>> {
  try {
    const parsed = archiveItemSchema.parse(input);
    const supabase = await createSupabaseServerClient();
    if (!supabase) {
      return { ok: false, reason: "unconfigured", message: "Supabase is not configured." };
    }
    const { data, error } = await supabase.rpc("flow_v3_3_archive_menu_item", {
      target_outlet_id: parsed.outletId,
      target_item_id: parsed.itemId
    });

    if (error) {
      return { ok: false, reason: "error", message: "Failed to archive item." };
    }

    const result = data as { item_id?: string } | null;

    if (!result?.item_id) {
      return { ok: false, reason: "error", message: "Failed to archive item." };
    }

    return { ok: true, data: { itemId: result.item_id } };
  } catch (error) {
    return { ok: false, reason: "error", message: serviceError(error) };
  }
}
