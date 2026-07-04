"use client";

import { useActionState } from "react";
import {
  demoSettlementAction,
  markServedAction,
  releaseToKitchenAction,
  type SettlementActionState
} from "./actions";

type LifecycleFormProps = {
  actionKind: "settlement" | "release" | "served";
  orderId: string;
};

const actionConfig = {
  settlement: {
    action: demoSettlementAction,
    eyebrow: "Pay at counter",
    title: "Record manual settlement",
    body:
      "This records the approved DEMO_MANUAL_SETTLEMENT action for an unpaid order. It is not a gateway, card, terminal, or Billplz integration.",
    pending: "Recording...",
    submit: "Record manual settlement"
  },
  release: {
    action: releaseToKitchenAction,
    eyebrow: "Kitchen release",
    title: "Release to kitchen",
    body:
      "This releases a paid QR pay-at-counter order to kitchen work. It creates the kitchen tickets and inventory reservation server-side.",
    pending: "Releasing...",
    submit: "Release to kitchen"
  },
  served: {
    action: markServedAction,
    eyebrow: "Fulfilment",
    title: "Mark served",
    body:
      "This records the dine-in fulfilment event after all required kitchen work is ready. Kitchen staff cannot perform this action.",
    pending: "Recording...",
    submit: "Mark served"
  }
} as const;

export function OrderLifecycleForm({ actionKind, orderId }: LifecycleFormProps) {
  const config = actionConfig[actionKind];
  const [state, formAction, isPending] = useActionState<
    SettlementActionState,
    FormData
  >(config.action, { message: "" });

  return (
    <form action={formAction} className="border border-[#d7d2c4] bg-white p-5 shadow-sm">
      <input name="orderId" type="hidden" value={orderId} />
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#667064]">
        {config.eyebrow}
      </p>
      <h2 className="mt-1 text-lg font-semibold">{config.title}</h2>
      <p className="mt-2 text-sm leading-6 text-[#667064]">
        {config.body}
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
        {isPending ? config.pending : config.submit}
      </button>
    </form>
  );
}
