"use server";

import { transitionKitchenTicket } from "@/lib/services/kitchen";

export type KitchenTransitionActionState = {
  message: string;
  ok?: boolean;
};

export async function transitionTicketAction(
  _prev: KitchenTransitionActionState,
  formData: FormData
): Promise<KitchenTransitionActionState> {
  const result = await transitionKitchenTicket({
    ticketId: String(formData.get("ticketId") ?? ""),
    nextStatus: String(formData.get("nextStatus") ?? "")
  });

  if (!result.ok) {
    return { message: result.message, ok: false };
  }

  return { message: "Ticket updated.", ok: true };
}
