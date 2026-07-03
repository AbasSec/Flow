"use client";

import { useActionState, useMemo } from "react";
import { sendMessageAction, type ConnectActionState } from "./actions";

export function MessageForm({ roomId }: { roomId: string }) {
  const clientNonce = useMemo(() => crypto.randomUUID(), []);
  const [state, formAction, isPending] = useActionState<
    ConnectActionState,
    FormData
  >(sendMessageAction, { message: "" });

  return (
    <form action={formAction} className="mt-4 space-y-3">
      <input name="roomId" type="hidden" value={roomId} />
      <input name="clientNonce" type="hidden" value={clientNonce} />
      <label className="block text-sm font-semibold text-[#344033]">
        Plain-text message
        <textarea
          className="mt-2 min-h-24 w-full resize-y border border-[#c8c1b1] px-3 py-3 text-base outline-none transition focus-visible:ring-2 focus-visible:ring-[#17211b]"
          maxLength={4000}
          name="body"
          placeholder="Coordinate the work. Messages do not change order, stock, ticket, or payment state."
          required
        />
      </label>
      {state.message ? (
        <p className="border border-[#c2410c] bg-[#fff7ed] px-3 py-2 text-sm text-[#7c2d12]">
          {state.message}
        </p>
      ) : null}
      <button
        className="min-h-11 bg-[#17211b] px-4 py-2 text-sm font-semibold text-white outline-none transition hover:bg-[#263128] focus-visible:ring-2 focus-visible:ring-[#17211b] focus-visible:ring-offset-2 disabled:bg-[#aab4a6]"
        disabled={isPending}
        type="submit"
      >
        {isPending ? "Sending..." : "Send message"}
      </button>
    </form>
  );
}
