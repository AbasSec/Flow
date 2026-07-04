"use client";

import { useActionState } from "react";
import {
  counterReleaseAction,
  counterSettleAction,
  type CounterActionState
} from "./actions";

type Props = {
  orderId: string;
  kind: "settle" | "release";
};

export function CounterActionForm({ orderId, kind }: Props) {
  const action = kind === "settle" ? counterSettleAction : counterReleaseAction;
  const label = kind === "settle" ? "Record settlement" : "Release to kitchen";
  const pendingLabel = kind === "settle" ? "Recording..." : "Releasing...";
  const successLabel = kind === "settle" ? "Settlement recorded" : "Released";

  const [state, formAction, isPending] = useActionState<CounterActionState, FormData>(
    action,
    { message: "" }
  );

  if (state.ok) {
    return (
      <span className="inline-flex items-center border border-[#73936a] bg-[#f0f7ec] px-3 py-2 text-sm font-semibold text-[#2f542c]">
        {successLabel}
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
        className="min-h-10 w-full bg-[#66785f] px-3 py-2 text-sm font-semibold text-white outline-none transition hover:bg-[#53654c] focus-visible:ring-2 focus-visible:ring-[#17211b] focus-visible:ring-offset-2 disabled:opacity-60"
        disabled={isPending}
        type="submit"
      >
        {isPending ? pendingLabel : label}
      </button>
    </form>
  );
}
