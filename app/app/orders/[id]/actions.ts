"use server";

import { revalidatePath } from "next/cache";
import {
  markOrderServed,
  releaseOrderToKitchen,
  settleOrderManually
} from "@/lib/services/orders";

export type SettlementActionState = {
  message: string;
  ok?: boolean;
};

export async function demoSettlementAction(
  _previousState: SettlementActionState,
  formData: FormData
): Promise<SettlementActionState> {
  const orderId = String(formData.get("orderId") ?? "");
  const result = await settleOrderManually(orderId);

  if (!result.ok) {
    return { message: result.message };
  }

  revalidatePath("/app");
  revalidatePath("/app/counter");
  revalidatePath(`/app/orders/${orderId}`);
  return { message: "Demo manual settlement recorded.", ok: true };
}

export async function releaseToKitchenAction(
  _previousState: SettlementActionState,
  formData: FormData
): Promise<SettlementActionState> {
  const orderId = String(formData.get("orderId") ?? "");
  const result = await releaseOrderToKitchen(orderId);

  if (!result.ok) {
    return { message: result.message };
  }

  revalidatePath("/app/kitchen");
  revalidatePath("/app/counter");
  revalidatePath("/app");
  revalidatePath(`/app/orders/${orderId}`);
  return { message: "Order released to kitchen.", ok: true };
}

export async function markServedAction(
  _previousState: SettlementActionState,
  formData: FormData
): Promise<SettlementActionState> {
  const orderId = String(formData.get("orderId") ?? "");
  const result = await markOrderServed(orderId);

  if (!result.ok) {
    return { message: result.message };
  }

  revalidatePath("/app");
  revalidatePath("/app/waiter");
  revalidatePath("/app/kitchen");
  revalidatePath(`/app/orders/${orderId}`);
  return { message: "Order marked served.", ok: true };
}
