"use server";

import { transitionKitchenTicket } from "@/lib/services/kitchen";

export async function transitionTicketAction(formData: FormData) {
  const result = await transitionKitchenTicket({
    ticketId: String(formData.get("ticketId") ?? ""),
    nextStatus: String(formData.get("nextStatus") ?? "")
  });

  if (!result.ok) {
    return;
  }
}
