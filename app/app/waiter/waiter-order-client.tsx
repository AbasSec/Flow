"use client";

import { useActionState, useMemo, useState } from "react";
import { createOrderAction, type WaiterActionState } from "./actions";
import { formatSen } from "@/lib/format";
import type { MenuItemOption, TableOption } from "@/lib/services/orders";

type CartLine = {
  menuItemId: string;
  quantity: number;
};

export function WaiterOrderClient({
  tables,
  menuItems
}: {
  tables: TableOption[];
  menuItems: MenuItemOption[];
}) {
  const [selectedTable, setSelectedTable] = useState(tables[0]?.id ?? "");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [requestKey] = useState(() => crypto.randomUUID());
  const [state, formAction, isPending] = useActionState<
    WaiterActionState,
    FormData
  >(createOrderAction, { message: "" });

  const cartItems = useMemo(
    () =>
      cart
        .map((line) => ({
          line,
          item: menuItems.find((menuItem) => menuItem.id === line.menuItemId)
        }))
        .filter((line) => line.item),
    [cart, menuItems]
  );

  const estimatedTotal = cartItems.reduce(
    (sum, line) => sum + (line.item?.priceSen ?? 0) * line.line.quantity,
    0
  );

  function addItem(menuItemId: string) {
    setCart((current) => {
      const existing = current.find((line) => line.menuItemId === menuItemId);

      if (existing) {
        return current.map((line) =>
          line.menuItemId === menuItemId
            ? { ...line, quantity: line.quantity + 1 }
            : line
        );
      }

      return [...current, { menuItemId, quantity: 1 }];
    });
  }

  function removeItem(menuItemId: string) {
    setCart((current) =>
      current
        .map((line) =>
          line.menuItemId === menuItemId
            ? { ...line, quantity: line.quantity - 1 }
            : line
        )
        .filter((line) => line.quantity > 0)
    );
  }

  return (
    <form action={formAction} className="grid gap-5 lg:grid-cols-[1fr_360px]">
      <input name="items" type="hidden" value={JSON.stringify(cart)} />
      <input name="requestKey" type="hidden" value={requestKey} />

      <section className="space-y-4">
        <div className="border border-[#d7d2c4] bg-white p-4">
          <label className="text-sm font-semibold text-[#344033]">
            Table
            <select
              className="mt-2 w-full border border-[#c8c1b1] bg-white px-3 py-3 text-base"
              name="tableSessionId"
              onChange={(event) => setSelectedTable(event.target.value)}
              required
              value={selectedTable}
            >
              {tables.map((table) => (
                <option key={table.id} value={table.id}>
                  {table.label} · {table.status}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {menuItems.map((item) => (
            <article className="border border-[#d7d2c4] bg-white p-4" key={item.id}>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#667064]">
                {item.categoryName} · {item.stationName ?? "Station"}
              </p>
              <h2 className="mt-2 text-lg font-semibold">{item.name}</h2>
              <p className="mt-2 min-h-10 text-sm leading-5 text-[#667064]">
                {item.description ?? "Seeded BrewBite menu item."}
              </p>
              <div className="mt-4 flex items-center justify-between gap-3">
                <span className="font-semibold">{formatSen(item.priceSen)}</span>
                <button
                  className="bg-[#17211b] px-3 py-2 text-sm font-semibold text-white"
                  onClick={() => addItem(item.id)}
                  type="button"
                >
                  Add
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>

      <aside className="border border-[#d7d2c4] bg-white p-4 lg:sticky lg:top-4 lg:self-start">
        <h2 className="text-lg font-semibold">Order cart</h2>
        {cartItems.length === 0 ? (
          <p className="mt-4 text-sm text-[#667064]">
            Add seeded menu items to create a real table-service order.
          </p>
        ) : (
          <div className="mt-4 space-y-3">
            {cartItems.map(({ line, item }) => (
              <div
                className="flex items-center justify-between gap-3 border-b border-[#ebe7dc] pb-3"
                key={line.menuItemId}
              >
                <div>
                  <p className="text-sm font-semibold">{item?.name}</p>
                  <p className="text-xs text-[#667064]">
                    {line.quantity} × {formatSen(item?.priceSen ?? 0)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    className="border border-[#c8c1b1] px-2 py-1"
                    onClick={() => removeItem(line.menuItemId)}
                    type="button"
                  >
                    -
                  </button>
                  <button
                    className="border border-[#c8c1b1] px-2 py-1"
                    onClick={() => addItem(line.menuItemId)}
                    type="button"
                  >
                    +
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="mt-5 flex items-center justify-between border-t border-[#d7d2c4] pt-4">
          <span className="text-sm text-[#667064]">Displayed estimate</span>
          <span className="text-xl font-semibold">{formatSen(estimatedTotal)}</span>
        </div>
        <p className="mt-2 text-xs leading-5 text-[#667064]">
          Final totals, stock checks, reservations, tickets, audit, and outbox
          records are calculated server-side.
        </p>
        {state.message ? (
          <p className="mt-4 border border-[#c2410c] bg-[#fff7ed] px-3 py-2 text-sm text-[#7c2d12]">
            {state.message}
          </p>
        ) : null}
        <button
          className="mt-5 w-full bg-[#66785f] px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-[#aab4a6]"
          disabled={cart.length === 0 || !selectedTable || isPending}
          type="submit"
        >
          {isPending ? "Creating order..." : "Create table order"}
        </button>
      </aside>
    </form>
  );
}
