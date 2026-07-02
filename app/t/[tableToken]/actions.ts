"use server";

import { redirect } from "next/navigation";
import { createPublicQrOrder } from "@/lib/services/public-ordering";

export type PublicOrderActionState = {
  message: string;
};

export async function submitPublicOrderAction(
  _previousState: PublicOrderActionState,
  formData: FormData
): Promise<PublicOrderActionState> {
  const tableToken = String(formData.get("tableToken") ?? "");
  const requestKey = String(formData.get("requestKey") ?? "");
  const itemsRaw = String(formData.get("items") ?? "[]");

  let items: unknown;

  try {
    items = JSON.parse(itemsRaw);
  } catch {
    return { message: "The cart could not be read. Please refresh and try again." };
  }

  const result = await createPublicQrOrder({
    tableToken,
    requestKey,
    items
  });

  if (!result.ok) {
    return { message: result.message };
  }

  redirect(`/order/${result.data.publicOrderId}`);
}
