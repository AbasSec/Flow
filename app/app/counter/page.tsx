import Link from "next/link";
import { AutoRefresh } from "@/components/auto-refresh";
import { AppShell, Badge, StatePanel, Surface } from "@/components/flow-ui";
import { formatSen } from "@/lib/format";
import { getCounterData, type CounterOrderCard } from "@/lib/services/counter";
import { CounterActionForm } from "./counter-action-form";

export const dynamic = "force-dynamic";

function formatAge(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

export default async function CounterPage() {
  const result = await getCounterData();

  if (!result.ok) {
    return (
      <AppShell
        subtitle="Counter workspace is limited to cashier, manager, admin, and owner."
        title="Counter"
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

  const { context, awaitingPayment, paidAwaitingRelease } = result.data;

  return (
    <AppShell
      role={context.role}
      subtitle="Manage pay-at-counter QR orders: record settlement and release to kitchen."
      title="Counter"
    >
      <AutoRefresh intervalMs={15000} />

      <Surface className="p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#667064]">
              Pay at counter
            </p>
            <h2 className="mt-1 text-lg font-semibold">Awaiting payment</h2>
          </div>
          <Badge tone={awaitingPayment.length > 0 ? "warning" : "neutral"}>
            {awaitingPayment.length}
          </Badge>
        </div>
        {awaitingPayment.length === 0 ? (
          <p className="mt-4 text-sm text-[#667064]">
            No orders are waiting for payment.
          </p>
        ) : (
          <div className="mt-4 space-y-3">
            {awaitingPayment.map((order) => (
              <CounterOrderRow key={order.id} kind="settle" order={order} />
            ))}
          </div>
        )}
      </Surface>

      <Surface className="p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#667064]">
              Kitchen release
            </p>
            <h2 className="mt-1 text-lg font-semibold">Paid — awaiting release</h2>
          </div>
          <Badge tone={paidAwaitingRelease.length > 0 ? "success" : "neutral"}>
            {paidAwaitingRelease.length}
          </Badge>
        </div>
        {paidAwaitingRelease.length === 0 ? (
          <p className="mt-4 text-sm text-[#667064]">
            No paid orders are awaiting kitchen release.
          </p>
        ) : (
          <div className="mt-4 space-y-3">
            {paidAwaitingRelease.map((order) => (
              <CounterOrderRow key={order.id} kind="release" order={order} />
            ))}
          </div>
        )}
      </Surface>
      <p className="text-sm leading-6 text-[#667064]">
        Pickup collection operations are not enabled in this workspace yet.
      </p>
    </AppShell>
  );
}

function CounterOrderRow({
  order,
  kind
}: {
  order: CounterOrderCard;
  kind: "settle" | "release";
}) {
  return (
    <div className="grid gap-3 border border-[#ebe7dc] bg-[#faf9f4] p-4 sm:grid-cols-[1fr_auto]">
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold">
            {order.tableLabel ?? "QR order"}
          </span>
          <Badge tone={kind === "settle" ? "warning" : "success"}>
            {kind === "settle" ? "Awaiting payment" : "Paid"}
          </Badge>
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
        <CounterActionForm kind={kind} orderId={order.id} />
      </div>
    </div>
  );
}
