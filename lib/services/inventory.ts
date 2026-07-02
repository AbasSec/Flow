import "server-only";

import { requireAdminClient } from "@/lib/services/context";

export type InventoryRisk = {
  ingredientId: string;
  name: string;
  unit: string;
  availableQuantity: number;
  lowStockThreshold: number;
  isLow: boolean;
};

type IngredientRow = {
  id: string;
  name: string;
  unit: string;
  low_stock_threshold: number | string;
};

type LedgerRow = {
  ingredient_id: string;
  quantity_delta: number | string;
};

export async function getInventoryRisks(
  orgId: string,
  outletId: string
): Promise<InventoryRisk[]> {
  const admin = requireAdminClient();

  const [ingredientsResult, ledgerResult] = await Promise.all([
    admin
      .from("ingredients")
      .select("id, name, unit, low_stock_threshold")
      .eq("org_id", orgId)
      .eq("outlet_id", outletId)
      .eq("is_active", true)
      .order("name"),
    admin
      .from("inventory_ledger")
      .select("ingredient_id, quantity_delta")
      .eq("org_id", orgId)
      .eq("outlet_id", outletId)
  ]);

  if (ingredientsResult.error) {
    throw ingredientsResult.error;
  }

  if (ledgerResult.error) {
    throw ledgerResult.error;
  }

  const balances = new Map<string, number>();

  for (const row of (ledgerResult.data ?? []) as LedgerRow[]) {
    balances.set(
      row.ingredient_id,
      (balances.get(row.ingredient_id) ?? 0) + Number(row.quantity_delta)
    );
  }

  return ((ingredientsResult.data ?? []) as IngredientRow[]).map((row) => {
    const availableQuantity = balances.get(row.id) ?? 0;
    const lowStockThreshold = Number(row.low_stock_threshold);

    return {
      ingredientId: row.id,
      name: row.name,
      unit: row.unit,
      availableQuantity,
      lowStockThreshold,
      isLow: availableQuantity <= lowStockThreshold
    };
  });
}
