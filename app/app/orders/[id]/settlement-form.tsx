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
    <form action={formAction} className="border border-[#d7d2c4] bg-white p-5">
      <input name="orderId" type="hidden" value={orderId} />
      <h2 className="text-lg font-semibold">Demo manual settlement</h2>
      <p className="mt-2 text-sm leading-6 text-[#667064]">
        This marks the unpaid table order as PAID for the competition demo only.
        It is not a gateway, card, terminal, or Billplz integration.
      </p>
      {state.message ? (
        <p className="mt-3 border border-[#d7d2c4] bg-[#faf9f4] px-3 py-2 text-sm">
          {state.message}
        </p>
      ) : null}
      <button
        className="mt-4 bg-[#66785f] px-4 py-3 text-sm font-semibold text-white disabled:bg-[#aab4a6]"
        disabled={isPending}
        type="submit"
      >
        {isPending ? "Recording..." : "Record DEMO_MANUAL_SETTLEMENT"}
      </button>
    </form>
  );
}
