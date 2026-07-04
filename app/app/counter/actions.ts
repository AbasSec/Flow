"use server";

import { revalidatePath } from "next/cache";
import { releaseOrderToKitchen, settleOrderManually } from "@/lib/services/orders";

export type CounterActionState = {
  message: string;
  ok?: boolean;
};

export async function counterSettleAction(
  _prev: CounterActionState,
  formData: FormData
): Promise<CounterActionState> {
  const orderId = String(formData.get("orderId") ?? "");
  const result = await settleOrderManually(orderId);

  if (!result.ok) {
    return { message: result.message, ok: false };
  }

  revalidatePath("/app/counter");
  revalidatePath(`/app/orders/${orderId}`);
  return { message: "Manual settlement recorded.", ok: true };
}

export async function counterReleaseAction(
  _prev: CounterActionState,
  formData: FormData
): Promise<CounterActionState> {
  const orderId = String(formData.get("orderId") ?? "");
  const result = await releaseOrderToKitchen(orderId);

  if (!result.ok) {
    return { message: result.message, ok: false };
  }

  revalidatePath("/app/counter");
  revalidatePath("/app/kitchen");
  revalidatePath(`/app/orders/${orderId}`);
  return { message: "Order released to kitchen.", ok: true };
}
