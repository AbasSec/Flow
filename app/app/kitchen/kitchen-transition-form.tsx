"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  transitionTicketAction,
  type KitchenTransitionActionState
} from "./actions";
import type { KitchenTicketStatus } from "@/lib/domain/states";

export function KitchenTransitionForm({
  ticketId,
  nextStatus
}: {
  ticketId: string;
  nextStatus: KitchenTicketStatus;
}) {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState<
    KitchenTransitionActionState,
    FormData
  >(transitionTicketAction, { message: "" });

  useEffect(() => {
    if (state.ok) {
      router.refresh();
    }
  }, [router, state.ok]);

  return (
    <form action={formAction} className="mt-5">
      <input name="ticketId" type="hidden" value={ticketId} />
      <input name="nextStatus" type="hidden" value={nextStatus} />
      {state.message && !state.ok ? (
        <p className="mb-2 text-xs text-[#89321e]">{state.message}</p>
      ) : null}
      <button
        className="min-h-12 w-full bg-[#17211b] px-4 py-3 text-sm font-semibold text-white outline-none transition hover:bg-[#263128] focus-visible:ring-2 focus-visible:ring-[#17211b] focus-visible:ring-offset-2 disabled:opacity-60"
        disabled={isPending || state.ok}
        type="submit"
      >
        {isPending ? "Updating..." : state.ok ? "Updated" : `Move to ${nextStatus}`}
      </button>
    </form>
  );
}
