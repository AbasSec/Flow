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
  const menuByCategory = useMemo(() => {
    const groups = new Map<string, MenuItemOption[]>();

    for (const item of menuItems) {
      const category = item.categoryName || "Menu";
      groups.set(category, [...(groups.get(category) ?? []), item]);
    }

    return Array.from(groups.entries());
  }, [menuItems]);
  const selectedTableLabel =
    tables.find((table) => table.id === selectedTable)?.label ?? "Select table";

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
    <form action={formAction} className="grid gap-5 lg:grid-cols-[1fr_380px]">
      <input name="items" type="hidden" value={JSON.stringify(cart)} />
      <input name="requestKey" type="hidden" value={requestKey} />

      <section className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          {["Select table", "Add items", "Send to kitchen"].map((step, index) => (
            <div
              className="border border-[#d7d2c4] bg-white px-4 py-3 shadow-sm"
              key={step}
            >
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#667064]">
                Step {index + 1}
              </p>
              <p className="mt-1 text-sm font-semibold text-[#17211b]">{step}</p>
            </div>
          ))}
        </div>

        <div className="border border-[#d7d2c4] bg-white p-4 shadow-sm">
          <label className="block text-sm font-semibold text-[#344033]">
            Table for this staff order
            <select
              className="mt-2 min-h-12 w-full border border-[#c8c1b1] bg-white px-3 py-3 text-base outline-none transition focus-visible:ring-2 focus-visible:ring-[#17211b]"
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

        <div className="space-y-5">
          {menuByCategory.map(([category, items]) => (
            <section key={category}>
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-[#5f675d]">
                  {category}
                </h2>
                <span className="text-xs text-[#667064]">{items.length} items</span>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {items.map((item) => (
                  <article
                    className="flex min-h-[188px] flex-col border border-[#d7d2c4] bg-white p-4 shadow-sm"
                    key={item.id}
                  >
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#667064]">
                      {item.stationName ?? "Kitchen station"}
                    </p>
                    <h3 className="mt-2 text-lg font-semibold">{item.name}</h3>
                    <p className="mt-2 flex-1 text-sm leading-5 text-[#667064]">
                      {item.description ?? "Prepared by the BrewBite kitchen."}
                    </p>
                    <div className="mt-4 flex items-center justify-between gap-3">
                      <span className="font-semibold">{formatSen(item.priceSen)}</span>
                      <button
                        className="min-h-11 bg-[#17211b] px-4 py-2 text-sm font-semibold text-white outline-none transition hover:bg-[#263128] focus-visible:ring-2 focus-visible:ring-[#17211b] focus-visible:ring-offset-2 disabled:bg-[#aab4a6]"
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
          ))}
        </div>
      </section>

      <aside className="border border-[#d7d2c4] bg-white p-4 shadow-sm lg:sticky lg:top-4 lg:self-start">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#667064]">
          Staff order
        </p>
        <div className="mt-2 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">Cart</h2>
            <p className="mt-1 text-sm text-[#667064]">{selectedTableLabel}</p>
          </div>
          <span className="border border-[#c8c1b1] bg-[#faf9f4] px-2 py-1 text-xs font-semibold">
            {cartItems.length} lines
          </span>
        </div>
        {cartItems.length === 0 ? (
          <div className="mt-4 border border-dashed border-[#c8c1b1] bg-[#faf9f4] p-4 text-sm leading-6 text-[#667064]">
            Add menu items to build a table-service order. The kitchen ticket is
            created after server validation.
          </div>
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
                    aria-label={`Remove one ${item?.name ?? "item"}`}
                    className="flex h-10 w-10 items-center justify-center border border-[#c8c1b1] text-lg outline-none transition hover:border-[#17211b] focus-visible:ring-2 focus-visible:ring-[#17211b]"
                    onClick={() => removeItem(line.menuItemId)}
                    type="button"
                  >
                    -
                  </button>
                  <button
                    aria-label={`Add one ${item?.name ?? "item"}`}
                    className="flex h-10 w-10 items-center justify-center border border-[#c8c1b1] text-lg outline-none transition hover:border-[#17211b] focus-visible:ring-2 focus-visible:ring-[#17211b]"
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
          <span className="text-sm font-semibold text-[#344033]">Displayed estimate</span>
          <span className="text-2xl font-semibold">{formatSen(estimatedTotal)}</span>
        </div>
        <p className="mt-2 text-xs leading-5 text-[#667064]">
          Final totals, stock checks, reservations, kitchen tickets, audit, and
          outbox records are calculated server-side.
        </p>
        {state.message ? (
          <p className="mt-4 border border-[#c2410c] bg-[#fff7ed] px-3 py-3 text-sm text-[#7c2d12]">
            {state.message}
          </p>
        ) : null}
        <button
          className="mt-5 min-h-12 w-full bg-[#66785f] px-4 py-3 text-sm font-semibold text-white outline-none transition hover:bg-[#53654c] focus-visible:ring-2 focus-visible:ring-[#17211b] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-[#aab4a6]"
          disabled={cart.length === 0 || !selectedTable || isPending}
          type="submit"
        >
          {isPending ? "Sending to kitchen..." : "Send order to kitchen"}
        </button>
      </aside>
    </form>
  );
}
