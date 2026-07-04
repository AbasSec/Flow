"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createTableOrder, markOrderServed } from "@/lib/services/orders";

export type WaiterActionState = {
  message: string;
  orderId?: string;
};

export async function createOrderAction(
  _previousState: WaiterActionState,
  formData: FormData
): Promise<WaiterActionState> {
  const tableSessionId = String(formData.get("tableSessionId") ?? "");
  const itemsRaw = String(formData.get("items") ?? "[]");
  const requestKey = String(formData.get("requestKey") ?? "");

  let items: unknown;

  try {
    items = JSON.parse(itemsRaw);
  } catch {
    return { message: "Cart data could not be read." };
  }

  const result = await createTableOrder({
    tableSessionId,
    items,
    requestKey
  });

  if (!result.ok) {
    return { message: result.message };
  }

  redirect(`/app/orders/${result.data.orderId}`);
}

export type FloorServedActionState = {
  message: string;
  ok?: boolean;
};

export async function markServedFromFloorAction(
  _prev: FloorServedActionState,
  formData: FormData
): Promise<FloorServedActionState> {
  const orderId = String(formData.get("orderId") ?? "");
  const result = await markOrderServed(orderId);

  if (!result.ok) {
    return { message: result.message, ok: false };
  }

  revalidatePath("/app");
  revalidatePath("/app/waiter");
  revalidatePath("/app/kitchen");
  revalidatePath(`/app/orders/${orderId}`);
  return { message: "Order marked served.", ok: true };
}
