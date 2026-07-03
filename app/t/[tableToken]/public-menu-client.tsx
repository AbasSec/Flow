"use client";

import { useActionState, useMemo, useState } from "react";
import { formatSen } from "@/lib/format";
import type { PublicTableMenu } from "@/lib/services/public-ordering";
import {
  submitPublicOrderAction,
  type PublicOrderActionState
} from "./actions";

type CartLine = {
  publicMenuToken: string;
  quantity: number;
};

export function PublicMenuClient({
  tableToken,
  menu
}: {
  tableToken: string;
  menu: PublicTableMenu;
}) {
  const [cart, setCart] = useState<CartLine[]>([]);
  const [requestKey] = useState(() => crypto.randomUUID());
  const [state, formAction, isPending] = useActionState<
    PublicOrderActionState,
    FormData
  >(submitPublicOrderAction, { message: "" });

  const allItems = menu.categories.flatMap((category) => category.items);
  const cartItems = useMemo(
    () =>
      cart
        .map((line) => ({
          line,
          item: allItems.find((item) => item.publicMenuToken === line.publicMenuToken)
        }))
        .filter((entry) => entry.item),
    [allItems, cart]
  );
  const displayEstimate = cartItems.reduce(
    (sum, entry) => sum + (entry.item?.priceSen ?? 0) * entry.line.quantity,
    0
  );

  function addItem(publicMenuToken: string) {
    setCart((current) => {
      const existing = current.find((line) => line.publicMenuToken === publicMenuToken);

      if (existing) {
        return current.map((line) =>
          line.publicMenuToken === publicMenuToken
            ? { ...line, quantity: line.quantity + 1 }
            : line
        );
      }

      return [...current, { publicMenuToken, quantity: 1 }];
    });
  }

  function removeItem(publicMenuToken: string) {
    setCart((current) =>
      current
        .map((line) =>
          line.publicMenuToken === publicMenuToken
            ? { ...line, quantity: line.quantity - 1 }
            : line
        )
        .filter((line) => line.quantity > 0)
    );
  }

  return (
    <form
      action={formAction}
      className="mt-5 space-y-5"
    >
      <input name="tableToken" type="hidden" value={tableToken} />
      <input name="requestKey" type="hidden" value={requestKey} />
      <input name="items" type="hidden" value={JSON.stringify(cart)} />

      <section className="space-y-6 pb-2">
        {menu.categories.map((category) => (
          <div key={category.name}>
            <div className="flex items-center justify-between gap-3 px-1">
              <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-[#5f675d]">
                {category.name}
              </h2>
              <span className="text-xs text-[#60685f]">
                {category.items.length} choices
              </span>
            </div>
            <div className="mt-3 space-y-3">
              {category.items.map((item) => (
                <article
                  className="border border-[#ded7c8] bg-white p-4 shadow-sm"
                  key={item.publicMenuToken}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="text-lg font-semibold text-[#17211b]">
                        {item.name}
                      </h3>
                      <p className="mt-1 text-sm leading-5 text-[#60685f]">
                        {item.description ?? "BrewBite kitchen item."}
                      </p>
                    </div>
                    <p className="shrink-0 text-sm font-semibold">
                      {formatSen(item.priceSen)}
                    </p>
                  </div>
                  <div className="mt-4 flex items-center justify-between gap-3">
                    <span
                      className={`text-xs font-semibold uppercase tracking-[0.08em] ${
                        item.available ? "text-[#527245]" : "text-[#9a3412]"
                      }`}
                    >
                      {item.available ? "Available" : "Unavailable"}
                    </span>
                    <button
                      className="min-h-11 min-w-24 bg-[#17211b] px-4 py-2 text-sm font-semibold text-white outline-none transition hover:bg-[#263128] focus-visible:ring-2 focus-visible:ring-[#17211b] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-[#a8afa4]"
                      disabled={!item.available}
                      onClick={() => addItem(item.publicMenuToken)}
                      type="button"
                    >
                      Add
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </div>
        ))}
      </section>

      <section className="sticky bottom-0 -mx-4 border-t border-[#d8d1c1] bg-[#f6f4ed]/95 px-4 py-4 backdrop-blur">
        <div className="border border-[#d8d1c1] bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold">Your order</h2>
              <p className="mt-1 text-xs text-[#60685f]">
                Sent to the kitchen now. Pay at the counter.
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-[#60685f]">{cartItems.length} lines</p>
              <p className="text-lg font-semibold">{formatSen(displayEstimate)}</p>
            </div>
          </div>
          {cartItems.length === 0 ? (
            <p className="mt-4 border border-dashed border-[#c8c1b1] bg-[#faf9f4] p-3 text-sm text-[#60685f]">
              Add an available item to continue.
            </p>
          ) : (
            <div className="mt-4 max-h-40 space-y-2 overflow-y-auto">
              {cartItems.map(({ line, item }) => (
                <div
                  className="flex items-center justify-between gap-3 text-sm"
                  key={line.publicMenuToken}
                >
                  <span className="min-w-0">
                    {item?.name} × {line.quantity}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      aria-label={`Remove one ${item?.name ?? "item"}`}
                      className="flex h-10 w-10 items-center justify-center border border-[#c8c1b1] text-lg outline-none transition hover:border-[#17211b] focus-visible:ring-2 focus-visible:ring-[#17211b]"
                      onClick={() => removeItem(line.publicMenuToken)}
                      type="button"
                    >
                      -
                    </button>
                    <button
                      aria-label={`Add one ${item?.name ?? "item"}`}
                      className="flex h-10 w-10 items-center justify-center border border-[#c8c1b1] text-lg outline-none transition hover:border-[#17211b] focus-visible:ring-2 focus-visible:ring-[#17211b]"
                      onClick={() => addItem(line.publicMenuToken)}
                      type="button"
                    >
                      +
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
          <p className="mt-3 text-xs leading-5 text-[#60685f]">
            This displayed estimate is recalculated and validated by the server
            before the order is accepted.
          </p>
          {state.message ? (
            <p className="mt-3 border border-[#c2410c] bg-[#fff7ed] px-3 py-2 text-sm text-[#7c2d12]">
              {state.message}
            </p>
          ) : null}
          {isPending ? (
            <p className="mt-3 border border-[#d8d1c1] bg-[#faf9f4] px-3 py-2 text-sm">
              Sending once. Please keep this page open.
            </p>
          ) : null}
          <button
            className="mt-4 min-h-12 w-full bg-[#66785f] px-4 py-3 text-base font-semibold text-white outline-none transition hover:bg-[#53654c] focus-visible:ring-2 focus-visible:ring-[#17211b] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-[#a8afa4]"
            disabled={cart.length === 0 || isPending}
            type="submit"
          >
            {isPending ? "Sending order..." : "Order now - pay at counter"}
          </button>
        </div>
      </section>
    </form>
  );
}
