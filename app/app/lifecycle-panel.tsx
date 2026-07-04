"use client";

import { useActionState } from "react";
import {
  enableOutletV31Action,
  type LifecycleActivationState
} from "./actions";

type LifecyclePanelProps = {
  outletId: string;
  lifecycleMode: string;
};

const initialState: LifecycleActivationState = { message: "" };

export function LifecycleActivationPanel({
  outletId,
  lifecycleMode
}: LifecyclePanelProps) {
  const [state, formAction, pending] = useActionState(
    enableOutletV31Action,
    initialState
  );

  if (lifecycleMode === "V3_1") {
    return (
      <div className="rounded border border-[#73936a] bg-[#f2f7f0] p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#4a6645]">
          Lifecycle mode
        </p>
        <p className="mt-2 text-sm font-semibold text-[#344033]">
          V3.1 active
        </p>
        <p className="mt-1 text-xs leading-5 text-[#667064]">
          QR pay-at-counter orders for this outlet require authorised
          settlement and release before kitchen work begins.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded border border-[#d7d2c4] bg-white p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#667064]">
        Lifecycle mode
      </p>
      <p className="mt-2 text-sm font-semibold text-[#344033]">Legacy</p>
      <p className="mt-1 text-xs leading-5 text-[#667064]">
        QR pay-at-counter orders currently enter the kitchen immediately on
        submission.
      </p>
      <form action={formAction} className="mt-3">
        <input name="outletId" type="hidden" value={outletId} />
        <details className="group">
          <summary className="cursor-pointer list-none">
            <span className="inline-flex items-center border border-[#d7d2c4] bg-[#faf9f4] px-3 py-1.5 text-xs font-semibold text-[#263128] outline-none transition hover:border-[#17211b] focus-visible:ring-2 focus-visible:ring-[#17211b] group-open:hidden">
              Enable V3.1 lifecycle
            </span>
          </summary>
          <div className="mt-3 rounded border border-[#d6a751] bg-[#fdf8ee] p-3 text-xs leading-5 text-[#5a4a1a]">
            <p className="font-semibold">Before enabling:</p>
            <ul className="mt-1 list-disc space-y-1 pl-4">
              <li>
                New QR pay-at-counter orders for this outlet will wait for
                authorised settlement and release before entering the kitchen.
              </li>
              <li>
                This cannot be switched back through normal operations.
              </li>
              <li>Existing orders and legacy outlets are not affected.</li>
            </ul>
          </div>
          <button
            className="mt-3 inline-flex min-h-9 items-center border border-[#73936a] bg-[#f2f7f0] px-3 py-1.5 text-xs font-semibold text-[#2d4a2a] outline-none transition hover:bg-[#e3eddf] focus-visible:ring-2 focus-visible:ring-[#73936a] disabled:opacity-50"
            disabled={pending}
            type="submit"
          >
            {pending ? "Activating…" : "Confirm — Enable V3.1 lifecycle"}
          </button>
        </details>
      </form>
      {state.message && (
        <p
          className={`mt-2 text-xs ${
            state.success ? "text-[#2d4a2a]" : "text-[#8b2c2c]"
          }`}
        >
          {state.message}
        </p>
      )}
    </div>
  );
}
