"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/db/server";
import { enableOutletV31 } from "@/lib/services/orders";

export type LifecycleActivationState = {
  message: string;
  success?: boolean;
};

export async function enableOutletV31Action(
  _previousState: LifecycleActivationState,
  formData: FormData
): Promise<LifecycleActivationState> {
  const outletId = String(formData.get("outletId") ?? "");

  if (!outletId) {
    return { message: "Outlet ID is required." };
  }

  const result = await enableOutletV31(outletId);

  if (!result.ok) {
    return { message: result.message };
  }

  revalidatePath("/app");

  if (!result.data.changed) {
    return {
      message: "V3.1 lifecycle mode is already active for this outlet.",
      success: true
    };
  }

  return {
    message:
      "V3.1 lifecycle mode activated. New QR pay-at-counter orders for this outlet will now require authorised settlement and release before entering the kitchen.",
    success: true
  };
}

export async function signOutAction() {
  const supabase = await createSupabaseServerClient();

  if (supabase) {
    await supabase.auth.signOut();
  }

  redirect("/login");
}
