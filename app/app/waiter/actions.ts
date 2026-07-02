"use server";

import { redirect } from "next/navigation";
import { createTableOrder } from "@/lib/services/orders";

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
