"use server";

import { redirect } from "next/navigation";
import { createPublicOutletQrOrder } from "@/lib/services/public-ordering";

export type PublicOutletOrderActionState = {
  message: string;
};

export async function submitOutletPublicOrderAction(
  _previousState: PublicOutletOrderActionState,
  formData: FormData
): Promise<PublicOutletOrderActionState> {
  const outletToken = String(formData.get("outletToken") ?? "");
  const tableToken = String(formData.get("tableToken") ?? "");
  const requestKey = String(formData.get("requestKey") ?? "");
  const itemsRaw = String(formData.get("items") ?? "[]");

  let items: unknown;

  try {
    items = JSON.parse(itemsRaw);
  } catch {
    return { message: "The cart could not be read. Please refresh and try again." };
  }

  const result = await createPublicOutletQrOrder({
    outletToken,
    tableToken,
    requestKey,
    items
  });

  if (!result.ok) {
    return { message: result.message };
  }

  redirect(`/order/${result.data.publicOrderId}`);
}
