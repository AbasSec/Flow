"use server";

import { revalidatePath } from "next/cache";
import {
  createMenuCategory,
  updateMenuCategory,
  archiveMenuCategory,
  createMenuItem,
  updateMenuItem,
  setItemAvailability,
  archiveMenuItem
} from "@/lib/services/menu-management";

export async function createCategoryAction(formData: FormData): Promise<void> {
  const result = await createMenuCategory({
    outletId: formData.get("outletId"),
    name: formData.get("name"),
    sortOrder: formData.get("sortOrder") ?? "0"
  });

  if (result.ok) {
    revalidatePath("/app/menu");
  }
}

export async function updateCategoryAction(formData: FormData): Promise<void> {
  const result = await updateMenuCategory({
    outletId: formData.get("outletId"),
    categoryId: formData.get("categoryId"),
    name: formData.get("name"),
    sortOrder: formData.get("sortOrder") ?? "0"
  });

  if (result.ok) {
    revalidatePath("/app/menu");
  }
}

export async function archiveCategoryAction(formData: FormData): Promise<void> {
  const result = await archiveMenuCategory({
    outletId: formData.get("outletId"),
    categoryId: formData.get("categoryId")
  });

  if (result.ok) {
    revalidatePath("/app/menu");
  }
}

export async function createItemAction(formData: FormData): Promise<void> {
  const result = await createMenuItem({
    outletId: formData.get("outletId"),
    categoryId: formData.get("categoryId"),
    name: formData.get("name"),
    description: formData.get("description"),
    priceSen: formData.get("priceSen"),
    isPublic: formData.get("isPublic") ?? "true",
    stationId: formData.get("stationId")
  });

  if (result.ok) {
    revalidatePath("/app/menu");
  }
}

export async function updateItemAction(formData: FormData): Promise<void> {
  const result = await updateMenuItem({
    outletId: formData.get("outletId"),
    itemId: formData.get("itemId"),
    name: formData.get("name"),
    description: formData.get("description"),
    priceSen: formData.get("priceSen"),
    isPublic: formData.get("isPublic") ?? "true",
    stationId: formData.get("stationId")
  });

  if (result.ok) {
    revalidatePath("/app/menu");
  }
}

export async function setAvailabilityAction(formData: FormData): Promise<void> {
  const result = await setItemAvailability({
    outletId: formData.get("outletId"),
    itemId: formData.get("itemId"),
    soldOut: formData.get("soldOut"),
    reason: formData.get("reason")
  });

  if (result.ok) {
    revalidatePath("/app/menu");
  }
}

export async function archiveItemAction(formData: FormData): Promise<void> {
  const result = await archiveMenuItem({
    outletId: formData.get("outletId"),
    itemId: formData.get("itemId")
  });

  if (result.ok) {
    revalidatePath("/app/menu");
  }
}
