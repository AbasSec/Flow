import Link from "next/link";
import { AutoRefresh } from "@/components/auto-refresh";
import { AppShell, Badge, StatePanel, Surface } from "@/components/flow-ui";
import { formatSen } from "@/lib/format";
import {
  SETTLEMENT_ROLES,
  ORDER_ENTRY_ROLES,
  requireWorkspaceContext,
  roleIn
} from "@/lib/services/context";
import { getOrderDetail } from "@/lib/services/orders";
import { OrderLifecycleForm } from "./settlement-form";

export const dynamic = "force-dynamic";

type OrderPageProps = {
  params: Promise<{ id: string }>;
};

const orderStatusLabels: Record<string, string> = {
  ACCEPTED: "Accepted",
  CANCELLED: "Cancelled",
  COMPLETED: "Order complete",
  COMPLETE: "Complete",
  COLLECTED: "Collected",
  HELD: "Held",
  NEW: "New",
  NOT_RELEASED: "Not released",
  OPEN: "Open",
  PAID: "Paid",
  PREPARING: "Preparing",
  READY: "Ready",
  READY_FOR_HANDOFF: "Ready for handoff",
  RELEASED: "Released",
  RELEASE_BY_AUTHORISED_STAFF: "Release by staff",
  RELEASE_ON_SUBMIT: "Release on submit",
  RELEASE_ON_VERIFIED_PAYMENT: "Release after verified payment",
  SERVED: "Served",
  SERVED_OR_COLLECTED: "Order complete",
  SUBMITTED: "Submitted",
  UNPAID: "Unpaid"
};

function formatOrderStatus(status: string): string {
  return orderStatusLabels[status] ?? status;
}

function isTerminalOrderStatus(status: string): boolean {
  return status === "SERVED_OR_COLLECTED" || status === "COMPLETED";
}

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
      subtitle="Internal order record with server-owned lines, kitchen state, settlement status, and work context."
      title="Order Detail"
    >
      <AutoRefresh intervalMs={5000} />
      <section className="grid gap-5 lg:grid-cols-[1fr_360px]">
        <div className="space-y-5">
          <Surface className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#667064]">
                  {order.tableLabel ?? "Table service"}
                </p>
                <p className="mt-2 text-sm text-[#667064]">
                  {new Date(order.createdAt).toLocaleString()}
                </p>
                <h2 className="mt-2 text-2xl font-semibold">
                  {formatSen(order.totalSen)}
                </h2>
              </div>
              <div className="flex gap-2">
                <Badge tone={isTerminalOrderStatus(order.serviceStatus) ? "success" : "warning"}>
                  {formatOrderStatus(order.serviceStatus)}
                </Badge>
                <Badge tone={order.paymentStatus === "PAID" ? "success" : "neutral"}>
                  {formatOrderStatus(order.paymentStatus)}
                </Badge>
              </div>
            </div>
          </Surface>

          <Surface className="p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">Order lines</h2>
              <span className="text-sm text-[#667064]">{order.lines.length} items</span>
            </div>
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
          </Surface>

          <Surface className="p-5">
            <h2 className="text-lg font-semibold">Kitchen tickets</h2>
            {order.tickets.length === 0 ? (
              <p className="mt-4 border border-dashed border-[#d7d2c4] bg-[#faf9f4] p-3 text-sm text-[#667064]">
                No active kitchen tickets yet. QR pay-at-counter orders wait
                for authorised settlement and kitchen release.
              </p>
            ) : (
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {order.tickets.map((ticket) => (
                  <div className="border border-[#ebe7dc] bg-[#faf9f4] p-3" key={ticket.id}>
                    <p className="text-sm font-semibold">{ticket.stationName}</p>
                    <p className="mt-1 text-xs text-[#667064]">
                      Ticket {ticket.id.slice(0, 6)} - {formatOrderStatus(ticket.status)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </Surface>
        </div>

        <aside className="space-y-5">
          <Surface className="p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#667064]">
              V3 lifecycle
            </p>
            <h2 className="mt-1 text-lg font-semibold">Operational ownership</h2>
            <dl className="mt-4 grid gap-3 text-sm">
              <LifecycleFact label="Payment" value={formatOrderStatus(order.paymentStatus)} />
              <LifecycleFact
                label="Release"
                value={
                  order.releaseState
                    ? `${formatOrderStatus(order.releaseState)} (${formatOrderStatus(order.releasePolicy ?? "Legacy")})`
                    : "Legacy record"
                }
              />
              <LifecycleFact
                label="Fulfilment"
                value={
                  order.fulfilmentState
                    ? formatOrderStatus(order.fulfilmentState)
                    : "Legacy / not yet evidenced"
                }
              />
              <LifecycleFact
                label="Closure"
                value={order.closureState ? formatOrderStatus(order.closureState) : "Legacy record"}
              />
            </dl>
          </Surface>
          {order.threadRoomId ? (
            <Link
              className="block border border-[#d7d2c4] bg-white p-5 shadow-sm outline-none transition hover:border-[#17211b] focus-visible:ring-2 focus-visible:ring-[#17211b]"
              href={`/app/connect?orderId=${order.id}`}
            >
              <Badge>Work thread</Badge>
              <h2 className="text-lg font-semibold">Flow Connect thread</h2>
              <p className="mt-2 text-sm leading-6 text-[#667064]">
                Open the order-linked work-item thread. Messages are context
                only and cannot change order, stock, kitchen, or payment state.
              </p>
            </Link>
          ) : null}
          <LifecycleGate
            fulfilmentState={order.fulfilmentState}
            orderChannel={order.orderChannel}
            orderId={order.id}
            paymentStatus={order.paymentStatus}
            releasePolicy={order.releasePolicy}
            releaseState={order.releaseState}
          />
        </aside>
      </section>
    </AppShell>
  );
}

function LifecycleFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border border-[#ebe7dc] bg-[#faf9f4] px-3 py-2">
      <dt className="text-[#667064]">{label}</dt>
      <dd className="text-right font-semibold">{value}</dd>
    </div>
  );
}

async function LifecycleGate({
  fulfilmentState,
  orderChannel,
  orderId,
  paymentStatus,
  releasePolicy,
  releaseState
}: {
  fulfilmentState: string | null;
  orderChannel: string;
  orderId: string;
  paymentStatus: string;
  releasePolicy: string | null;
  releaseState: string | null;
}) {
  const context = await requireWorkspaceContext();

  if (
    paymentStatus === "UNPAID" &&
    roleIn(context.role, SETTLEMENT_ROLES)
  ) {
    return <OrderLifecycleForm actionKind="settlement" orderId={orderId} />;
  }

  if (
    paymentStatus === "PAID" &&
    releasePolicy === "RELEASE_BY_AUTHORISED_STAFF" &&
    releaseState === "NOT_RELEASED" &&
    roleIn(context.role, SETTLEMENT_ROLES)
  ) {
    return <OrderLifecycleForm actionKind="release" orderId={orderId} />;
  }

  if (
    (orderChannel === "table" || orderChannel === "qr") &&
    fulfilmentState === "READY_FOR_HANDOFF" &&
    roleIn(context.role, ORDER_ENTRY_ROLES)
  ) {
    return <OrderLifecycleForm actionKind="served" orderId={orderId} />;
  }

  if (!roleIn(context.role, SETTLEMENT_ROLES) && !roleIn(context.role, ORDER_ENTRY_ROLES)) {
    return (
      <StatePanel title="Settlement">
        Settlement is unavailable for this order state or role.
      </StatePanel>
    );
  }

  return (
    <StatePanel title="Lifecycle actions">
      No lifecycle action is currently available for this order state.
    </StatePanel>
  );
}
