import Link from "next/link";
import { AutoRefresh } from "@/components/auto-refresh";
import { AppShell, Badge, StatePanel } from "@/components/flow-ui";
import { formatSen } from "@/lib/format";
import {
  SETTLEMENT_ROLES,
  requireWorkspaceContext,
  roleIn
} from "@/lib/services/context";
import { getOrderDetail } from "@/lib/services/orders";
import { SettlementForm } from "./settlement-form";

export const dynamic = "force-dynamic";

type OrderPageProps = {
  params: Promise<{ id: string }>;
};

export default async function OrderDetailPage({ params }: OrderPageProps) {
  const { id } = await params;
  const result = await getOrderDetail(id);

  if (!result.ok) {
    return (
      <AppShell
        subtitle="Order detail is limited to authorised internal organisation users."
        title="Order Detail"
      >
        <StatePanel
          title={result.reason === "not_found" ? "Not found" : "Unavailable"}
          tone={result.reason === "not_found" ? "neutral" : "error"}
        >
          {result.message}
        </StatePanel>
      </AppShell>
    );
  }

  const order = result.data;

  return (
    <AppShell
      subtitle="Internal order detail with real order lines, kitchen tickets, inventory-backed state, and linked Flow Connect thread."
      title={`Order ${order.id.slice(0, 8)}`}
    >
      <AutoRefresh intervalMs={5000} />
      <section className="grid gap-5 lg:grid-cols-[1fr_360px]">
        <div className="space-y-5">
          <div className="border border-[#d7d2c4] bg-white p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm text-[#667064]">
                  {order.tableLabel ?? "Table service"} ·{" "}
                  {new Date(order.createdAt).toLocaleString()}
                </p>
                <h2 className="mt-2 text-2xl font-semibold">
                  {formatSen(order.totalSen)}
                </h2>
              </div>
              <div className="flex gap-2">
                <Badge>{order.serviceStatus}</Badge>
                <Badge>{order.paymentStatus}</Badge>
              </div>
            </div>
          </div>

          <div className="border border-[#d7d2c4] bg-white p-5">
            <h2 className="text-lg font-semibold">Order lines</h2>
            <div className="mt-4 divide-y divide-[#ebe7dc]">
              {order.lines.map((line) => (
                <div className="flex justify-between gap-4 py-3 text-sm" key={line.id}>
                  <div>
                    <p className="font-semibold">{line.name}</p>
                    <p className="text-[#667064]">
                      {line.quantity} × {formatSen(line.unitPriceSen)}
                    </p>
                  </div>
                  <p className="font-semibold">{formatSen(line.lineTotalSen)}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="border border-[#d7d2c4] bg-white p-5">
            <h2 className="text-lg font-semibold">Kitchen tickets</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {order.tickets.map((ticket) => (
                <div className="border border-[#ebe7dc] p-3" key={ticket.id}>
                  <p className="text-sm font-semibold">{ticket.stationName}</p>
                  <p className="mt-1 text-xs text-[#667064]">
                    {ticket.id.slice(0, 8)} · {ticket.status}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <aside className="space-y-5">
          {order.threadRoomId ? (
            <Link
              className="block border border-[#d7d2c4] bg-white p-5 transition hover:border-[#17211b]"
              href={`/app/connect?orderId=${order.id}`}
            >
              <h2 className="text-lg font-semibold">Flow Connect thread</h2>
              <p className="mt-2 text-sm leading-6 text-[#667064]">
                Open the order-linked work-item thread. Messages are context
                only and cannot change order, stock, kitchen, or payment state.
              </p>
            </Link>
          ) : null}
          <SettlementGate orderId={order.id} paymentStatus={order.paymentStatus} />
        </aside>
      </section>
    </AppShell>
  );
}

async function SettlementGate({
  orderId,
  paymentStatus
}: {
  orderId: string;
  paymentStatus: string;
}) {
  const context = await requireWorkspaceContext();

  if (paymentStatus !== "UNPAID" || !roleIn(context.role, SETTLEMENT_ROLES)) {
    return (
      <StatePanel title="Settlement">
        Settlement is unavailable for this order state or role.
      </StatePanel>
    );
  }

  return <SettlementForm orderId={orderId} />;
}
