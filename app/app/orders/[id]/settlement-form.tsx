"use client";

import { useActionState } from "react";
import {
  demoSettlementAction,
  type SettlementActionState
} from "./actions";

export function SettlementForm({ orderId }: { orderId: string }) {
  const [state, formAction, isPending] = useActionState<
    SettlementActionState,
    FormData
  >(demoSettlementAction, { message: "" });

  return (
    <form action={formAction} className="border border-[#d7d2c4] bg-white p-5 shadow-sm">
      <input name="orderId" type="hidden" value={orderId} />
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#667064]">
        Pay at counter
      </p>
      <h2 className="mt-1 text-lg font-semibold">Record manual settlement</h2>
      <p className="mt-2 text-sm leading-6 text-[#667064]">
        This records the approved DEMO_MANUAL_SETTLEMENT action for an unpaid
        table order. It is not a gateway, card, terminal, or Billplz integration.
      </p>
      {state.message ? (
        <p className="mt-3 border border-[#d7d2c4] bg-[#faf9f4] px-3 py-2 text-sm">
          {state.message}
        </p>
      ) : null}
      <button
        className="mt-4 min-h-12 w-full bg-[#66785f] px-4 py-3 text-sm font-semibold text-white outline-none transition hover:bg-[#53654c] focus-visible:ring-2 focus-visible:ring-[#17211b] focus-visible:ring-offset-2 disabled:bg-[#aab4a6]"
        disabled={isPending}
        type="submit"
      >
        {isPending ? "Recording..." : "Record manual settlement"}
      </button>
    </form>
  );
}
