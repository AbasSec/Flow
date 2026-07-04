import Link from "next/link";
import { AutoRefresh } from "@/components/auto-refresh";
import { AppShell, Badge, StatePanel, Surface } from "@/components/flow-ui";
import { formatSen } from "@/lib/format";
import {
  getReadyToServeOrders,
  getWaiterData,
  type ReadyToServeCard
} from "@/lib/services/orders";
import { FloorServeForm } from "./floor-serve-form";
import { WaiterOrderClient } from "./waiter-order-client";

export const dynamic = "force-dynamic";

function formatAge(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

export default async function FloorServicePage() {
  const result = await getWaiterData();

  if (!result.ok) {
    return (
      <AppShell
        subtitle="Floor & Service is limited to table-service order-entry roles."
        title="Floor & Service"
      >
        <StatePanel
          title={result.reason === "forbidden" ? "Forbidden" : "Unavailable"}
          tone={result.reason === "forbidden" ? "forbidden" : "error"}
        >
          {result.message}
        </StatePanel>
      </AppShell>
    );
  }

  const { tables, menuItems, context, outletId } = result.data;
  const readyOrdersResult = await getReadyToServeOrders(context, outletId);
  const readyOrders = readyOrdersResult.ok ? readyOrdersResult.data : [];

  return (
    <AppShell
      role={context.role}
      subtitle="Serve ready dine-in orders and create new table-service orders."
      title="Floor & Service"
    >
      <AutoRefresh intervalMs={15000} />

      <Surface className="p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#667064]">
              Dine-in
            </p>
            <h2 className="mt-1 text-lg font-semibold">Ready to serve</h2>
          </div>
          <Badge tone={readyOrders.length > 0 ? "success" : "neutral"}>
            {readyOrders.length}
          </Badge>
        </div>
        {readyOrders.length === 0 ? (
          readyOrdersResult.ok ? (
            <p className="mt-4 text-sm text-[#667064]">
              No dine-in orders are ready for service yet.
            </p>
          ) : (
            <div className="mt-4">
              <StatePanel title="Service queue unavailable" tone="error">
                {readyOrdersResult.message}
              </StatePanel>
            </div>
          )
        ) : (
          <div className="mt-4 space-y-3">
            {readyOrders.map((order) => (
              <ReadyToServeRow key={order.id} order={order} />
            ))}
          </div>
        )}
      </Surface>

      <Surface className="p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#667064]">
          Table service
        </p>
        <h2 className="mt-1 text-lg font-semibold">New table order</h2>
        {tables.length === 0 || menuItems.length === 0 ? (
          <div className="mt-4">
            <StatePanel title="Empty setup">
              Tables or menu items are not available yet.
            </StatePanel>
          </div>
        ) : (
          <div className="mt-5">
            <WaiterOrderClient menuItems={menuItems} tables={tables} />
          </div>
        )}
      </Surface>
    </AppShell>
  );
}

function ReadyToServeRow({ order }: { order: ReadyToServeCard }) {
  return (
    <div className="grid gap-3 border border-[#ebe7dc] bg-[#faf9f4] p-4 sm:grid-cols-[1fr_auto]">
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold">
            {order.tableLabel ?? "Table order"}
          </span>
          <Badge tone="success">Ready to serve</Badge>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs text-[#667064]">
          <span>{formatSen(order.totalSen)}</span>
          <span aria-hidden>·</span>
          <span>{formatAge(order.ageMinutes)} ago</span>
          <span aria-hidden>·</span>
          <Link
            className="text-[#5f7056] underline-offset-2 hover:underline"
            href={`/app/orders/${order.id}`}
          >
            Open record
          </Link>
        </div>
      </div>
      <div className="flex items-center">
        <FloorServeForm orderId={order.id} />
      </div>
    </div>
  );
}
