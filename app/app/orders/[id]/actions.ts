"use server";

import { revalidatePath } from "next/cache";
import { settleOrderManually } from "@/lib/services/orders";

export type SettlementActionState = {
  message: string;
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

  revalidatePath(`/app/orders/${orderId}`);
  return { message: "Demo manual settlement recorded." };
}
