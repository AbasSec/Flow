"use client";

import { useActionState } from "react";
import {
  markServedFromFloorAction,
  type FloorServedActionState
} from "./actions";

export function FloorServeForm({ orderId }: { orderId: string }) {
  const [state, formAction, isPending] = useActionState<FloorServedActionState, FormData>(
    markServedFromFloorAction,
    { message: "" }
  );

  if (state.ok) {
    return (
      <span className="inline-flex items-center border border-[#73936a] bg-[#f0f7ec] px-3 py-2 text-sm font-semibold text-[#2f542c]">
        Served
      </span>
    );
  }

  return (
    <form action={formAction}>
      <input name="orderId" type="hidden" value={orderId} />
      {state.message && (
        <p className="mb-2 text-xs text-[#89321e]">{state.message}</p>
      )}
      <button
        className="min-h-10 w-full bg-[#17211b] px-3 py-2 text-sm font-semibold text-white outline-none transition hover:bg-[#263128] focus-visible:ring-2 focus-visible:ring-[#17211b] focus-visible:ring-offset-2 disabled:opacity-60"
        disabled={isPending}
        type="submit"
      >
        {isPending ? "Recording..." : "Mark served"}
      </button>
    </form>
  );
}
