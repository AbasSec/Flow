"use server";

import { sendConnectMessage } from "@/lib/services/communication";

export type ConnectActionState = {
  message: string;
};

export async function sendMessageAction(
  _previousState: ConnectActionState,
  formData: FormData
): Promise<ConnectActionState> {
  const result = await sendConnectMessage({
    roomId: String(formData.get("roomId") ?? ""),
    body: String(formData.get("body") ?? ""),
    clientNonce: String(formData.get("clientNonce") ?? "")
  });

  if (!result.ok) {
    return { message: result.message };
  }

  return { message: "" };
}
